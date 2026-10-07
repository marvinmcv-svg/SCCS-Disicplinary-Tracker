// /api/support-plans — learning-support plans (IEP / 504 / ELL / BIP / Gifted /
// Health) with their accommodations. Staff can read; case managers write.
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth, canViewSupportPlans, canManageSupportPlans, forbidden } from '@/lib/sccs-auth';
import { supportPlanSchema, parseBody } from '@/lib/sccs-validation';
import { serializePlan } from '../_lib/support';

export const dynamic = 'force-dynamic';

// GET ?student_id=&plan_type=&status=&q=
export const GET = withAuth(async (req, user) => {
  try {
    if (!canViewSupportPlans(user)) return forbidden();
    const sp = req.nextUrl.searchParams;
    const where: Prisma.SupportPlansWhereInput = {};
    const studentId = Number.parseInt(sp.get('student_id') ?? '', 10);
    if (!Number.isNaN(studentId)) where.student_id = studentId;
    const planType = sp.get('plan_type');
    if (planType) where.plan_type = planType;
    const status = sp.get('status');
    if (status) where.status = status;
    const q = sp.get('q')?.trim();
    if (q) {
      where.OR = [
        { student: { first_name: { contains: q, mode: 'insensitive' } } },
        { student: { last_name: { contains: q, mode: 'insensitive' } } },
        { student: { student_id: { contains: q, mode: 'insensitive' } } },
        { primary_need: { contains: q, mode: 'insensitive' } },
      ];
    }

    const plans = await db.supportPlans.findMany({
      where,
      include: { student: true, accommodations: { orderBy: { id: 'asc' } } },
      orderBy: [{ status: 'asc' }, { review_date: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json(plans.map(serializePlan));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — create a plan plus its accommodations in one transaction.
export const POST = withAuth(async (req, user) => {
  try {
    if (!canManageSupportPlans(user)) return forbidden();
    const parsed = parseBody(supportPlanSchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json(parsed.response, { status: 400 });
    const d = parsed.data;

    const student = await db.students.findUnique({ where: { id: d.student_id }, select: { id: true } });
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const created = await db.supportPlans.create({
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
        accommodations: {
          create: (d.accommodations ?? []).map((a) => ({
            category: a.category,
            description: a.description,
            applies_to: a.applies_to ?? 'All classes',
            active: a.active ?? true,
          })),
        },
      },
    });
    return NextResponse.json({ id: created.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
