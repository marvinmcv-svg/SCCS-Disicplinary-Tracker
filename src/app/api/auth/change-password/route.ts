// POST /api/auth/change-password — the signed-in user replaces their own
// password. Requires the current password, so a borrowed session cannot lock
// the owner out. Clears must_change_password, signs out every other session
// (tokens issued before password_changed_at stop working) and returns a fresh
// token for this one.
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { withAuth, signToken } from '@/lib/sccs-auth';
import { passwordProblem } from '@/lib/sccs-passwords';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req, user) => {
  try {
    const body = (await req.json().catch(() => null)) as
      | { currentPassword?: unknown; newPassword?: unknown }
      | null;
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
    }

    const account = await db.users.findUnique({ where: { id: user.userId } });
    if (!account || !bcrypt.compareSync(currentPassword, account.password)) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const problem = passwordProblem(newPassword);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'The new password must be different from the current one' },
        { status: 400 },
      );
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    // Whole seconds, so the token signed below (iat in seconds) stays valid.
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await db.users.update({
      where: { id: user.userId },
      data: { password: hash, must_change_password: false, password_changed_at: changedAt },
    });
    await db.passwordHistory.create({ data: { user_id: user.userId, password_hash: hash } });
    await db.userActivityLog.create({
      data: { user_id: user.userId, action: 'CHANGE_PASSWORD', details: 'Changed own password' },
    });

    return NextResponse.json({ success: true, token: signToken(user.userId, user.role) });
  } catch (error) {
    console.error('Change password error:', (error as Error).message);
    return NextResponse.json({ error: 'Password change failed' }, { status: 500 });
  }
});
