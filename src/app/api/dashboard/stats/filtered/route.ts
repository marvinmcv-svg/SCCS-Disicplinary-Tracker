// GET /api/dashboard/stats/filtered — port of sccs/server/routes/index.ts:1178.
// Enhanced dashboard stats with date range, grade, category and status
// filters ('all' is ignored). Dates are 'YYYY-MM-DD' text and compared
// lexically, exactly like the SQL casts behaved.
//
// weeklyTrend: incidents of the last 12 weeks grouped by week (ISO string of
// the Monday), with only the grade/category filters applied — faithful to the
// original query's filters (the original's parameter binding for this
// sub-query was buggy; the intended filters are applied correctly here).
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';
import { groupCounts, mondayOfWeek } from '../../../_lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req) => {
  try {
    const sp = req.nextUrl.searchParams;
    const startDate = sp.get('startDate');
    const endDate = sp.get('endDate');
    const grade = sp.get('grade');
    const category = sp.get('category');
    const status = sp.get('status');

    // WHERE 1=1 AND date filters AND grade AND category AND status
    const where: Prisma.IncidentsWhereInput = {};
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }
    if (grade && grade !== 'all') where.student = { grade: Number(grade) };
    if (category && category !== 'all') where.violation = { category };
    if (status && status !== 'all') where.status = status;

    const rows = await db.incidents.findMany({
      where,
      select: {
        status: true,
        student: { select: { grade: true } },
        violation: { select: { category: true } },
      },
    });

    const total = rows.length;
    const pending = rows.filter((r) => r.status === 'Open').length;
    const resolved = rows.filter((r) => r.status === 'Resolved').length;

    const byCategory = groupCounts(rows.map((r) => r.violation?.category ?? '')).map(
      ({ key: c, count }) => ({ category: c, count }),
    );
    const byGrade = groupCounts(rows.map((r) => r.student?.grade ?? 0))
      .map(({ key: g, count }) => ({ grade: g, count }))
      .sort((a, b) => a.grade - b.grade);
    const byStatus = groupCounts(rows.map((r) => r.status)).map(
      ({ key: s, count }) => ({ status: s, count }),
    );

    const recentRows = await db.incidents.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        incident_id: true,
        date: true,
        status: true,
        student: { select: { last_name: true, first_name: true } },
        violation: { select: { violation_type: true } },
      },
    });
    const recentIncidents = recentRows.map((r) => ({
      id: r.id,
      incident_id: r.incident_id,
      date: r.date,
      status: r.status,
      last_name: r.student?.last_name ?? '',
      first_name: r.student?.first_name ?? '',
      violation_type: r.violation?.violation_type ?? '',
      // The ported Incidents model has no advisor column — the key is kept
      // in the response shape (always null) for frontend compatibility.
      advisor: null as string | null,
    }));

    // Weekly trend for the line chart: last 12 weeks, grade/category filters
    // only (no date-range or status filters), grouped by week (Monday).
    const trendWhere: Prisma.IncidentsWhereInput = {
      date: { gte: new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
    };
    if (grade && grade !== 'all') trendWhere.student = { grade: Number(grade) };
    if (category && category !== 'all') trendWhere.violation = { category };

    const trendRows = await db.incidents.findMany({
      where: trendWhere,
      select: { date: true },
    });

    const weekMap = new Map<string, number>();
    for (const r of trendRows) {
      const week = mondayOfWeek(r.date);
      if (!week) continue;
      weekMap.set(week, (weekMap.get(week) ?? 0) + 1);
    }
    const weeklyTrend = [...weekMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([week, count]) => ({ week, count }));

    return NextResponse.json({
      total,
      pending,
      resolved,
      byCategory,
      byGrade,
      byStatus,
      recentIncidents,
      weeklyTrend,
    });
  } catch (error) {
    console.error('Dashboard filtered error:', (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
