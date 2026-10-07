// /api/referrals/[id] — read or update one referral (coordinators only).
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
  if (!canViewReferrals(user)) return forbidden('Referrals are visible to coordinators only');
  const id = Number.parseInt((await ctx.params).id, 10);
  const referral = await db.disciplinaryReferrals.findUnique({ where: { id } });
  if (!referral) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
  return NextResponse.json(referral);
});

export const PUT = withAuth<Ctx>(async (req: NextRequest, user, ctx) => {
  if (!canViewReferrals(user)) return forbidden('Referrals are visible to coordinators only');
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
