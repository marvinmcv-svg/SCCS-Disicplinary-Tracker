// PUT /api/users/[id]/reactivate — port of sccs/server/routes/index.ts:1154.
// Admin only.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const { id } = await ctx.params;
    await db.users.updateMany({
      where: { id: Number.parseInt(id, 10) },
      data: { is_active: true },
    });

    // Log activity
    await db.userActivityLog.create({
      data: {
        user_id: user.userId,
        action: 'REACTIVATE_USER',
        details: `Reactivated user ID: ${id}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
