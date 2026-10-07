// POST /api/auth/passkey/login — verify the signed challenge and sign the user in.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { signToken } from '@/lib/sccs-auth';
import { relyingParty, takeChallenge } from '@/lib/passkeys';

export const dynamic = 'force-dynamic';

const FAILED = 'Fingerprint sign-in failed. Please sign in with your password.';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { challengeId?: unknown; response?: { id?: unknown } } | null;
  const expectedChallenge = await takeChallenge(body?.challengeId, 'login');
  if (!expectedChallenge || typeof body?.response?.id !== 'string') {
    return NextResponse.json({ error: FAILED }, { status: 400 });
  }
  const passkey = await db.passkeys.findUnique({ where: { credential_id: body.response.id } });
  if (!passkey) {
    return NextResponse.json(
      { error: 'This fingerprint is not set up for SCCS any more. Sign in with your password, then set it up again.' },
      { status: 401 },
    );
  }
  const { rpID, origin } = relyingParty(req);
  try {
    const verification = await verifyAuthenticationResponse({
      response: body.response as any,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(passkey.public_key),
        counter: Number(passkey.counter),
        transports: (passkey.transports?.split(',').filter(Boolean) ?? []) as AuthenticatorTransport[],
      },
    });
    if (!verification.verified) return NextResponse.json({ error: FAILED }, { status: 401 });

    const user = await db.users.findUnique({ where: { id: passkey.user_id } });
    if (!user || !user.is_active) {
      return NextResponse.json({ error: 'This account has been deactivated. Contact a coordinator.' }, { status: 403 });
    }
    await db.passkeys.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), last_used_at: new Date() },
    });
    await db.users.update({ where: { id: user.id }, data: { last_login: new Date() } });
    return NextResponse.json({
      token: signToken(user.id, user.role),
      user: { id: user.id, username: user.username, role: user.role, firstName: user.first_name, lastName: user.last_name },
    });
  } catch {
    return NextResponse.json({ error: FAILED }, { status: 401 });
  }
}
