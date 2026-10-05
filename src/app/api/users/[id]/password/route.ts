// PUT /api/users/[id]/password — port of sccs/server/routes/index.ts:1032.
// Admin only; validates like reset-password.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { password?: unknown } | null;
    const password = body?.password;
    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    // Stronger password validation
    const passwordStr = String(password);
    if (passwordStr.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!/\d/.test(passwordStr)) {
      return NextResponse.json({ error: 'Password must contain at least one number' }, { status: 400 });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(passwordStr)) {
      return NextResponse.json(
        { error: 'Password must contain at least one special character' },
        { status: 400 },
      );
    }

    const hashedPassword = bcrypt.hashSync(passwordStr, 10);
    await db.users.updateMany({
      where: { id: Number.parseInt(id, 10) },
      data: { password: hashedPassword },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
