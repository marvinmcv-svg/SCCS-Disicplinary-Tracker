// PUT /api/users/[id]/password — port of sccs/server/routes/index.ts:1032.
// Admin only; validates like reset-password. The user must replace the
// password at their next sign-in.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { withAuth, isAdminLike, guardAdminAccounts } from '@/lib/sccs-auth';
import { passwordProblem } from '@/lib/sccs-passwords';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!isAdminLike(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const { id } = await ctx.params;
    const denied = await guardAdminAccounts(user, Number.parseInt(id, 10));
    if (denied) return denied;
    const body = (await req.json().catch(() => ({}))) as { password?: unknown } | null;
    const password = body?.password;
    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const passwordStr = String(password);
    const problem = passwordProblem(passwordStr);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const hashedPassword = bcrypt.hashSync(passwordStr, 10);
    await db.users.updateMany({
      where: { id: Number.parseInt(id, 10) },
      // An admin-chosen password is temporary: the user replaces it at their
      // next sign-in, and sessions opened with the old one end.
      data: { password: hashedPassword, must_change_password: true, password_changed_at: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
