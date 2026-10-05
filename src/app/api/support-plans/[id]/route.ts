// /api/support-plans/[id] — read, update (replaces accommodations) or delete a plan.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withAuth, canViewSupportPlans, canManageSupportPlans, forbidden,
} from '@/lib/sccs-auth';
import { supportPlanSchema, parseBody } from '@/lib/sccs-validation';
import { serializePlan } from '../../_lib/support';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const parseId = async (ctx: Ctx) => Number.parseInt((await ctx.params).id, 10);

export const GET = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!canViewSupportPlans(user)) return forbidden();
    const id = await parseId(ctx);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 });
    const plan = await db.supportPlans.findUnique({
      where: { id },
      include: { student: true, accommodations: { orderBy: { id: 'asc' } } },
    });
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    return NextResponse.json(serializePlan(plan));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!canManageSupportPlans(user)) return forbidden();
    const id = await parseId(ctx);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 });
    const parsed = parseBody(supportPlanSchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json(parsed.response, { status: 400 });
    const d = parsed.data;

    const existing = await db.supportPlans.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    await db.$transaction(async (tx) => {
      await tx.supportPlans.update({
        where: { id },
        data: {
          student_id: d.student_id,
          plan_type: d.plan_type,
          primary_need: d.primary_need ?? null,
          case_manager: d.case_manager ?? null,
          start_date: d.start_date,
          review_date: d.review_date ?? null,
          status: d.status ?? 'Active',
          behavior_considerations: d.behavior_considerations ?? null,
          parent_consent: d.parent_consent ?? true,
          notes: d.notes ?? null,
        },
      });
      // Accommodations are edited as a list: only replace them when sent.
      if (d.accommodations) {
        await tx.accommodations.deleteMany({ where: { plan_id: id } });
        if (d.accommodations.length) {
          await tx.accommodations.createMany({
            data: d.accommodations.map((a) => ({
              plan_id: id,
              category: a.category,
              description: a.description,
              applies_to: a.applies_to ?? 'All classes',
              active: a.active ?? true,
            })),
          });
        }
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});

export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!canManageSupportPlans(user)) return forbidden();
    const id = await parseId(ctx);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 });
    await db.supportPlans.deleteMany({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
