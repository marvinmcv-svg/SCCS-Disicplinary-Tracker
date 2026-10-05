import { FullConfig } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * Deterministic data baseline: re-run the (idempotent) seed before the suite
 * so exact-count assertions and "newest incident first" ordering hold, and
 * leftover rows from manual/debug runs are wiped.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const root = path.resolve(__dirname, '..');
  // The Prisma schema pins the SQLite URL, so no DATABASE_URL is needed here.
  const res = spawnSync('bun', ['prisma/seed.ts'], {
    cwd: root,
    stdio: 'pipe',
    timeout: 120_000,
  });
  const out = res.stdout?.toString() ?? '';
  const err = res.stderr?.toString() ?? '';
  if (res.status !== 0) {
    throw new Error(`Seed failed (exit ${res.status}):\n${out}\n${err}`);
  }
  console.log('[global-setup] seed refreshed demo data');
}
