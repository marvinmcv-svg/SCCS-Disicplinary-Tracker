// /api/recognitions/[id] — remove a recognition awarded in error.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canManageSupportPlans, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!canManageSupportPlans(user)) return forbidden();
    const id = Number.parseInt((await ctx.params).id, 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    await db.recognitions.deleteMany({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
