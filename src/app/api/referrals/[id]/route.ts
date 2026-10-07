// /api/referrals/[id] — coordinators read and update any referral; the staff
// member who filed it can read it (without the coordinators' notes), nobody
// else can.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withAuth, canViewReferrals, forbidden } from '@/lib/sccs-auth';
import { parseBody } from '@/lib/sccs-validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  status: z.enum(['New', 'In review', 'Closed']).optional(),
  coordinator_notes: z.string().max(10000).optional().nullable(),
});

export const GET = withAuth<Ctx>(async (_req, user, ctx) => {
  const id = Number.parseInt((await ctx.params).id, 10);
  const referral = Number.isNaN(id) ? null : await db.disciplinaryReferrals.findUnique({ where: { id } });
  const coordinator = canViewReferrals(user);
  // Someone else's referral answers 404, not 403, so its existence is not revealed.
  if (!referral || (!coordinator && referral.submitted_by !== user.userId)) {
    return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
  }
  return NextResponse.json(coordinator ? referral : { ...referral, coordinator_notes: null });
});

export const PUT = withAuth<Ctx>(async (req: NextRequest, user, ctx) => {
  if (!canViewReferrals(user)) return forbidden('Only coordinators can edit referrals');
  const id = Number.parseInt((await ctx.params).id, 10);
  const parsed = parseBody(updateSchema, await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json(parsed.response, { status: 400 });
  const exists = await db.disciplinaryReferrals.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
  const referral = await db.disciplinaryReferrals.update({
    where: { id },
    data: { ...parsed.data, reviewed_by: user.userId, reviewed_at: new Date() },
  });
  return NextResponse.json(referral);
});
