// DELETE /api/auth/passkeys/[id] — remove one of your own fingerprint sign-ins.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  const id = Number.parseInt((await ctx.params).id, 10);
  const { count } = await db.passkeys.deleteMany({ where: { id, user_id: user.userId } });
  if (count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
});
