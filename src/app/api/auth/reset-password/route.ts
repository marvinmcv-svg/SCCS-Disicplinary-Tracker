// POST /api/auth/reset-password — port of sccs/server/routes/index.ts:313.
//
// Consumes a password-reset token (see forgot-password). Password policy is
// the original's: at least 8 characters, one number and one special character.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { checkRateLimit, clientIp } from '@/lib/sccs-rate-limit';

export const dynamic = 'force-dynamic';

interface ResetBody {
  token?: unknown;
  newPassword?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    // The original reuses the passwordResetLimiter whose keyGenerator reads a
    // username this endpoint never receives — so it is effectively per-IP.
    const key = `resetpw:ip:${clientIp(req)}`;
    const limit = checkRateLimit(key, 60 * 60 * 1000, 5);
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please wait an hour and try again.' },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => null)) as ResetBody | null;
    const token = body?.token;
    const newPassword = body?.newPassword;

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password are required' },
        { status: 400 },
      );
    }

    const newPasswordStr = String(newPassword);

    // Password validation
    if (newPasswordStr.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!/\d/.test(newPasswordStr)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number' },
        { status: 400 },
      );
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPasswordStr)) {
      return NextResponse.json(
        { error: 'Password must contain at least one special character' },
        { status: 400 },
      );
    }

    // Find valid token (unused, unexpired)
    const resetToken = await db.passwordResetTokens.findFirst({
      where: { token: String(token), used: false, expires_at: { gt: new Date() } },
    });

    if (!resetToken) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    // Hash new password and update the user. updateMany keeps the original's
    // "UPDATE ... WHERE" semantics (0 rows affected is still a success).
    const hashedPassword = bcrypt.hashSync(newPasswordStr, 10);
    await db.users.updateMany({
      where: { id: resetToken.user_id },
      data: { password: hashedPassword },
    });
    // Record the new hash in the password history audit trail.
    try {
      await db.passwordHistory.create({
        data: { user_id: resetToken.user_id, password_hash: hashedPassword },
      });
    } catch {
      /* best-effort audit trail */
    }

    // Mark token as used
    await db.passwordResetTokens.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    return NextResponse.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', (error as Error).message);
    return NextResponse.json({ error: 'Password reset failed' }, { status: 500 });
  }
}
