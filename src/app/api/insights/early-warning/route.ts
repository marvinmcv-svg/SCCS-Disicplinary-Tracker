// GET /api/insights/early-warning — a transparent, rules-based early-warning
// score per student (the SIS "early warning" / MTSS insight), plus IDEA
// manifestation-determination alerts for students with IEP/504 plans.
//
// Every point of a score is explainable: the response lists the factors that
// produced it, so staff can see *why* a student is flagged.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canViewSupportPlans, forbidden } from '@/lib/sccs-auth';
import {
  MDR_THRESHOLD_DAYS, MDR_WARNING_DAYS, PROTECTED_PLAN_TYPES, schoolYearStart,
} from '../../_lib/support';

export const dynamic = 'force-dynamic';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export interface RiskFactor { label: string; points: number }

export const GET = withAuth(async (req, user) => {
  try {
    if (!canViewSupportPlans(user)) return forbidden();
    const limit = Math.min(Math.max(Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 1), 600);

    const d30 = daysAgo(30);
    const d60 = daysAgo(60);
    const yearStart = schoolYearStart();

    const [students, incidents, mtss, plans, recognitions] = await Promise.all([
      db.students.findMany({
        select: {
          id: true, student_id: true, first_name: true, last_name: true, grade: true, section: true,
          total_points: true, conduct_status: true, profile_picture: true,
        },
      }),
      db.incidents.findMany({
        where: { date: { gte: yearStart < d60 ? yearStart : d60 } },
        select: { student_id: true, date: true, days_oss: true, days_iss: true, violation: { select: { severity: true } } },
      }),
      db.mtssInterventions.findMany({
        where: { OR: [{ end_date: null }, { end_date: '' }, { end_date: { gte: daysAgo(0) } }] },
        select: { student_id: true, tier: true },
      }),
      db.supportPlans.findMany({ where: { status: { in: ['Active', 'Under Review'] } }, select: { student_id: true, plan_type: true } }),
      db.recognitions.findMany({ where: { date: { gte: d30 } }, select: { student_id: true } }),
    ]);

    type Agg = { inc30: number; incPrev: number; severe: number; oss: number; iss: number };
    const agg = new Map<number, Agg>();
    const get = (id: number) => {
      let a = agg.get(id);
      if (!a) { a = { inc30: 0, incPrev: 0, severe: 0, oss: 0, iss: 0 }; agg.set(id, a); }
      return a;
    };
    let incidents30 = 0;
    for (const inc of incidents) {
      const a = get(inc.student_id);
      if (inc.date >= d30) { a.inc30 += 1; incidents30 += 1; } else if (inc.date >= d60) a.incPrev += 1;
      if (inc.date >= yearStart) {
        a.oss += inc.days_oss || 0;
        a.iss += inc.days_iss || 0;
        const sev = inc.violation?.severity;
        if (sev === 'High' || sev === 'Critical') a.severe += 1;
      }
    }
    const tierBy = new Map<number, number>();
    for (const m of mtss) tierBy.set(m.student_id, Math.max(tierBy.get(m.student_id) ?? 0, m.tier));
    const plansBy = new Map<number, string[]>();
    for (const p of plans) plansBy.set(p.student_id, [...(plansBy.get(p.student_id) ?? []), p.plan_type]);
    const recBy = new Map<number, number>();
    for (const r of recognitions) recBy.set(r.student_id, (recBy.get(r.student_id) ?? 0) + 1);

    const scored = students.map((s) => {
      const a = agg.get(s.id) ?? { inc30: 0, incPrev: 0, severe: 0, oss: 0, iss: 0 };
      const tier = tierBy.get(s.id) ?? 0;
      const recs = recBy.get(s.id) ?? 0;
      const planTypes = [...new Set(plansBy.get(s.id) ?? [])];
      const factors: RiskFactor[] = [];
      const add = (label: string, points: number) => { if (points !== 0) factors.push({ label, points }); };

      add(`${a.inc30} incident${a.inc30 === 1 ? '' : 's'} in the last 30 days`, Math.min(a.inc30 * 12, 36));
      add(`${a.severe} high-severity incident${a.severe === 1 ? '' : 's'} this year`, Math.min(a.severe * 8, 24));
      add(`${a.oss + a.iss} suspension day${a.oss + a.iss === 1 ? '' : 's'} this year`, Math.min((a.oss + a.iss) * 3, 18));
      add(`Conduct points at ${s.total_points}`, Math.min(Math.max(0, Math.round((100 - s.total_points) / 2)), 15));
      if (tier >= 2) add(`MTSS Tier ${tier} intervention`, tier === 3 ? 10 : 5);
      if (a.inc30 > a.incPrev && a.inc30 >= 2) add('Incidents rising vs. previous 30 days', 7);
      if (recs > 0) add(`${recs} positive recognition${recs === 1 ? '' : 's'} (protective)`, -Math.min(recs * 3, 12));

      const score = Math.max(0, Math.min(100, factors.reduce((n, f) => n + f.points, 0)));
      const level = score >= 60 ? 'High' : score >= 30 ? 'Moderate' : 'Low';
      const protectedPlan = planTypes.some((t) => PROTECTED_PLAN_TYPES.has(t));
      return {
        id: s.id,
        student_id: s.student_id,
        first_name: s.first_name,
        last_name: s.last_name,
        grade: s.grade,
        section: s.section,
        profile_picture: s.profile_picture,
        conduct_status: s.conduct_status,
        total_points: s.total_points,
        incidents_30d: a.inc30,
        incidents_prev_30d: a.incPrev,
        oss_days_ytd: a.oss,
        iss_days_ytd: a.iss,
        mtss_tier: tier || null,
        recognitions_30d: recs,
        plan_types: planTypes,
        score,
        level,
        factors: factors.sort((x, y) => y.points - x.points),
        mdr: protectedPlan && a.oss >= MDR_WARNING_DAYS
          ? { oss_days: a.oss, threshold: MDR_THRESHOLD_DAYS, required: a.oss >= MDR_THRESHOLD_DAYS }
          : null,
      };
    });

    const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.last_name.localeCompare(b.last_name));
    const recognitions30 = recognitions.length;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      school_year_start: yearStart,
      summary: {
        high: scored.filter((s) => s.level === 'High').length,
        moderate: scored.filter((s) => s.level === 'Moderate').length,
        low: scored.filter((s) => s.level === 'Low').length,
        students: scored.length,
        with_plans: plansBy.size,
        mdr_alerts: scored.filter((s) => s.mdr).length,
        incidents_30d: incidents30,
        recognitions_30d: recognitions30,
        positive_ratio: incidents30 ? Math.round((recognitions30 / incidents30) * 10) / 10 : null,
      },
      students: ranked.slice(0, limit),
      mdr_alerts: scored.filter((s) => s.mdr).sort((a, b) => (b.mdr!.oss_days - a.mdr!.oss_days)),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
