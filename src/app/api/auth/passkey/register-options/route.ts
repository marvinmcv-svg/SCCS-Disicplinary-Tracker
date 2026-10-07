// POST /api/auth/passkey/register-options — start adding fingerprint sign-in
// for the signed-in user on this device.
import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { withAuth, getUserRow } from '@/lib/sccs-auth';
import { RP_NAME, relyingParty, saveChallenge } from '@/lib/passkeys';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req: NextRequest, user) => {
  const row = await getUserRow(user.userId);
  if (!row || !row.is_active) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  const { rpID } = relyingParty(req);
  const existing = await db.passkeys.findMany({ where: { user_id: row.id, rp_id: rpID } });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: row.username,
    userDisplayName: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
    userID: new TextEncoder().encode(`sccs-user-${row.id}`),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credential_id,
      transports: (p.transports?.split(',').filter(Boolean) ?? []) as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    },
  });
  const challengeId = await saveChallenge(options.challenge, 'register', row.id);
  return NextResponse.json({ options, challengeId });
});
