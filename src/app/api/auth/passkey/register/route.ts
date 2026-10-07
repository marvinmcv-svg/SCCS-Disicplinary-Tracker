// POST /api/auth/passkey/register — verify the new passkey and store its public key.
import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';
import { deviceLabel, relyingParty, takeChallenge } from '@/lib/passkeys';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req: NextRequest, user) => {
  const body = (await req.json().catch(() => null)) as { challengeId?: unknown; response?: unknown } | null;
  const expectedChallenge = await takeChallenge(body?.challengeId, 'register', user.userId);
  if (!expectedChallenge || !body?.response) {
    return NextResponse.json({ error: 'The fingerprint setup expired. Please try again.' }, { status: 400 });
  }
  const { rpID, origin } = relyingParty(req);
  try {
    const verification = await verifyRegistrationResponse({
      response: body.response as any,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Fingerprint setup could not be verified' }, { status: 400 });
    }
    const { credential } = verification.registrationInfo;
    await db.passkeys.create({
      data: {
        user_id: user.userId,
        credential_id: credential.id,
        public_key: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports?.join(',') ?? null,
        rp_id: rpID,
        device_label: deviceLabel(req),
      },
    });
    await db.userActivityLog
      .create({ data: { user_id: user.userId, action: 'ADD_PASSKEY', details: deviceLabel(req) } })
      .catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Fingerprint setup failed' }, { status: 400 });
  }
});
