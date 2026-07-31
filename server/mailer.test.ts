import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `isConfigured()` is the gate that stops the app claiming it contacted a parent
 * when no message was ever sent. The notification endpoint returns 503 when this
 * is false, so if it ever returned true on incomplete settings, staff would be
 * back to seeing false confirmations.
 *
 * The module reads its settings at import time, so each case re-imports it.
 */

const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(SMTP_VARS.map(k => [k, process.env[k]]));
  for (const k of SMTP_VARS) delete process.env[k];
  vi.resetModules();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function loadMailer() {
  vi.resetModules();
  return import('./mailer');
}

function configure(overrides: Record<string, string> = {}) {
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_USER = 'sccs@example.test';
  process.env.SMTP_PASSWORD = 'secret';
  process.env.SMTP_FROM = 'SCCS <sccs@example.test>';
  Object.assign(process.env, overrides);
}

describe('isConfigured', () => {
  it('is false when nothing is set', async () => {
    const mailer = await loadMailer();
    expect(mailer.isConfigured()).toBe(false);
  });

  it('is true when host, user, password and a from address are all present', async () => {
    configure();
    const mailer = await loadMailer();
    expect(mailer.isConfigured()).toBe(true);
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'])(
    'is false when %s alone is missing',
    async (missing) => {
      configure();
      delete process.env[missing];
      const mailer = await loadMailer();
      expect(mailer.isConfigured()).toBe(false);
    }
  );

  it('falls back to the SMTP username when no explicit from address is set', async () => {
    configure();
    delete process.env.SMTP_FROM;
    const mailer = await loadMailer();
    expect(mailer.isConfigured()).toBe(true);
    expect(mailer.fromAddress).toBe('sccs@example.test');
  });

  it('is not fooled by empty strings', async () => {
    configure({ SMTP_HOST: '' });
    const mailer = await loadMailer();
    expect(mailer.isConfigured()).toBe(false);
  });
});

describe('sendMail when unconfigured', () => {
  it('throws rather than silently reporting success', async () => {
    const mailer = await loadMailer();
    await expect(
      mailer.sendMail({ to: 'parent@example.test', subject: 'x', text: 'y' })
    ).rejects.toThrow(/not configured/i);
  });
});

describe('verifyConnection when unconfigured', () => {
  it('reports false instead of throwing', async () => {
    const mailer = await loadMailer();
    await expect(mailer.verifyConnection()).resolves.toBe(false);
  });
});
