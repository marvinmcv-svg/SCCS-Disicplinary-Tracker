// GET /api/students/[id]/support — a student's learning-support plans,
// recognitions summary and school-year removal days, computed server-side so
// the IDEA manifestation-determination warning is accurate for every role.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canViewSupportPlans, forbidden } from '@/lib/sccs-auth';
import {
  MDR_THRESHOLD_DAYS, MDR_WARNING_DAYS, PROTECTED_PLAN_TYPES, schoolYearStart, serializePlan,
} from '../../../_lib/support';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!canViewSupportPlans(user)) return forbidden();
    const id = Number.parseInt((await ctx.params).id, 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });

    const yearStart = schoolYearStart();
    const [plans, removals, recognitions] = await Promise.all([
      db.supportPlans.findMany({
        where: { student_id: id },
        include: { student: true, accommodations: { orderBy: { id: 'asc' } } },
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
      }),
      db.incidents.aggregate({
        where: { student_id: id, date: { gte: yearStart } },
        _sum: { days_oss: true, days_iss: true },
      }),
      db.recognitions.findMany({
        where: { student_id: id },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
    ]);

    const current = plans.filter((p) => p.status === 'Active' || p.status === 'Under Review');
    const ossDays = removals._sum.days_oss ?? 0;
    const protectedPlan = current.some((p) => PROTECTED_PLAN_TYPES.has(p.plan_type));

    return NextResponse.json({
      plans: plans.map(serializePlan),
      active_plan_types: [...new Set(current.map((p) => p.plan_type))],
      removal_days_ytd: ossDays,
      iss_days_ytd: removals._sum.days_iss ?? 0,
      mdr: protectedPlan
        ? {
            threshold: MDR_THRESHOLD_DAYS,
            warning_at: MDR_WARNING_DAYS,
            status: ossDays >= MDR_THRESHOLD_DAYS ? 'required' : ossDays >= MDR_WARNING_DAYS ? 'approaching' : 'ok',
          }
        : null,
      recognitions,
      recognition_points: recognitions.reduce((n, r) => n + r.points, 0),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
