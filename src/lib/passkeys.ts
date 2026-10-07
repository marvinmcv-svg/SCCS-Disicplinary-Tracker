// Fingerprint / Face ID / Windows Hello sign-in with WebAuthn passkeys.
//
// The device keeps a private key behind its biometric lock; the server keeps
// only the public key (table passkeys) and checks a signed, one-time challenge
// (table auth_challenges). No password is stored on the device. Passkeys are
// bound to the host name they were created on, so staff should always open
// the app at the same address.
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const RP_NAME = 'SCCS Student OS';
const CHALLENGE_TTL_MS = 5 * 60_000;

/** The public origin the browser sees (Vercel forwards the original host). */
export function relyingParty(req: NextRequest): { rpID: string; origin: string } {
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host).split(',')[0].trim();
  const proto = (req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')).split(',')[0].trim();
  return { rpID: host.replace(/:\d+$/, ''), origin: `${proto}://${host}` };
}

export async function saveChallenge(challenge: string, kind: 'register' | 'login', userId?: number): Promise<string> {
  const id = randomUUID();
  await db.authChallenges.deleteMany({ where: { expires_at: { lt: new Date() } } });
  await db.authChallenges.create({
    data: { id, challenge, kind, user_id: userId ?? null, expires_at: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return id;
}

/** Returns the challenge once, then deletes it (no replays). */
export async function takeChallenge(id: unknown, kind: 'register' | 'login', userId?: number): Promise<string | null> {
  if (typeof id !== 'string' || !id) return null;
  const row = await db.authChallenges.findUnique({ where: { id } });
  if (!row) return null;
  await db.authChallenges.delete({ where: { id } }).catch(() => undefined);
  if (row.kind !== kind || row.expires_at < new Date()) return null;
  if (kind === 'register' && row.user_id !== userId) return null;
  return row.challenge;
}

export function deviceLabel(req: NextRequest): string {
  const ua = req.headers.get('user-agent') || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'This device';
}
