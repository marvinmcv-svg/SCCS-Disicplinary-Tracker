// POST /api/auth/passkey/login-options — start a fingerprint sign-in. No
// username is needed: the device offers the passkeys it holds for this site.
import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { relyingParty, saveChallenge } from '@/lib/passkeys';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { rpID } = relyingParty(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  const challengeId = await saveChallenge(options.challenge, 'login');
  return NextResponse.json({ options, challengeId });
}
