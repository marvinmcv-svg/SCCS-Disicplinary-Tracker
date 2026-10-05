// POST /api/auth/forgot-password — port of sccs/server/routes/index.ts:248.
//
// Rate-limited to 5 requests/hour (keyed per username, IP fallback) because
// each request writes to the database. Never reveals whether the username
// exists; the token itself only goes to the server log (mailer is not
// configured in this environment), so an administrator can hand it over out
// of band.
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { checkRateLimit, clientIp } from '@/lib/sccs-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { username?: unknown } | null;
    const username = body?.username;

    // passwordResetLimiter: 5 / hour, keyed per normalized username.
    const normalized =
      typeof username === 'string' ? username.trim().toLowerCase() : '';
    const key = normalized ? `reset:${normalized}` : `ip:${clientIp(req)}`;
    const limit = checkRateLimit(key, 60 * 60 * 1000, 5);
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please wait an hour and try again.' },
        { status: 429 },
      );
    }

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Find user by username
    const user = await db.users.findUnique({ where: { username: String(username) } });
    if (!user) {
      // Don't reveal if user exists or not for security
      return NextResponse.json({
        message: 'If an account exists with that username, a password reset link will be sent.',
      });
    }

    // Generate reset token (random 32 character hex)
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Delete any existing tokens for this user, then create the new one.
    await db.passwordResetTokens.deleteMany({ where: { user_id: user.id } });
    await db.passwordResetTokens.create({
      data: { user_id: user.id, token, expires_at: expiresAt },
    });

    // The token must never travel back in this response. Mailer is not
    // configured in this environment — mirror the original's no-email path:
    // the token goes to the log so an administrator can pass it on out of
    // band.
    console.log(
      `Password reset token for user id ${user.id} (expires ${expiresAt.toISOString()}): ${token}`,
    );

    return NextResponse.json({
      message: 'If an account exists with that username, a password reset link will be sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', (error as Error).message);
    return NextResponse.json({ error: 'Password reset request failed' }, { status: 500 });
  }
}
