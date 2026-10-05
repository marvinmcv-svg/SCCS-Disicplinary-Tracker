// /api/mtss — port of sccs/server/routes/index.ts:722 (GET) and 757 (POST).
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth, canManageStudents, forbidden } from '@/lib/sccs-auth';
import { mtssSchema, parseBody } from '@/lib/sccs-validation';
import { flattenMtss } from '@/lib/sccs-serialize';
import { stripMtssRef, todayStr, datePlusDaysStr } from '../_lib/api-utils';

export const dynamic = 'force-dynamic';

// GET — joined student names, tier_history parsed back from JSON text.
export const GET = withAuth(async (req) => {
  try {
    const sp = req.nextUrl.searchParams;
    const advisor = sp.get('advisor');
    const tier = sp.get('tier');
    const reviewSoon = sp.get('review_soon');

    const where: Prisma.MtssInterventionsWhereInput = {};
    if (advisor) where.advisor = advisor;
    if (tier) {
      const tierNum = Number.parseInt(tier, 10);
      if (!Number.isNaN(tierNum)) where.tier = tierNum;
    }
    if (reviewSoon === 'true') {
      // Interventions with review_date within the next 30 days. review_date is
      // 'YYYY-MM-DD' text — '' sorts below any date and is excluded, NULL
      // never matches (same as the original's IS NOT NULL / != '' guards).
      where.review_date = {
        not: null,
        gte: todayStr(),
        lte: datePlusDaysStr(30),
      };
    }

    const interventions = await db.mtssInterventions.findMany({
      where,
      include: { student: true },
      orderBy: { start_date: 'desc' },
    });

    return NextResponse.json(interventions.map((row) => stripMtssRef(flattenMtss(row))));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — create an intervention (counselor/admin only, validated).
export const POST = withAuth(async (req, user) => {
  try {
    if (!canManageStudents(user)) return forbidden();

    const body = await req.json().catch(() => null);
    const parsed = parseBody(mtssSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }
    const d = parsed.data;

    // The schema strips unknown keys, so incident_link/tier_history always
    // arrive undefined here — the original wrote NULL / '[]' for them.
    const created = await db.mtssInterventions.create({
      data: {
        student_id: d.student_id,
        tier: d.tier,
        intervention: d.intervention,
        advisor: d.advisor || null,
        start_date: d.start_date,
        end_date: d.end_date || null,
        progress: d.progress || 'Not Started',
        notes: d.notes || '',
        intervention_goal: d.intervention_goal || null,
        progress_monitoring: d.progress_monitoring || null,
        review_date: d.review_date || null,
        exit_criteria: d.exit_criteria || null,
        incident_link: null,
        tier_history: JSON.stringify([]),
      },
    });
    return NextResponse.json({ id: created.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
