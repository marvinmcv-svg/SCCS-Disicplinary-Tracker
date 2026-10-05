// GET /api/support-plans/summary — { [student db id]: ['IEP', '504', …] } for
// active plans. Powers the roster "plan" badges (like the SIS roster alerts).
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canViewSupportPlans, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, user) => {
  try {
    if (!canViewSupportPlans(user)) return forbidden();
    const plans = await db.supportPlans.findMany({
      where: { status: { in: ['Active', 'Under Review'] } },
      select: { student_id: true, plan_type: true },
    });
    const map: Record<number, string[]> = {};
    for (const p of plans) {
      const list = (map[p.student_id] ??= []);
      if (!list.includes(p.plan_type)) list.push(p.plan_type);
    }
    return NextResponse.json(map);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
