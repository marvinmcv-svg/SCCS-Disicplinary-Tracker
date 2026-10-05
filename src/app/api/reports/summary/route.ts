// GET /api/reports/summary — port of sccs/server/routes/index.ts:1479.
// Query params: start_date, end_date, grade, category ('all' is ignored).
// Returns { total, open, pending, resolved, byCategory (count DESC), byGrade }.
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';
import { groupCounts } from '../../_lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req) => {
  try {
    const sp = req.nextUrl.searchParams;
    const startDate = sp.get('start_date');
    const endDate = sp.get('end_date');
    const grade = sp.get('grade');
    const category = sp.get('category');

    const where: Prisma.IncidentsWhereInput = {};
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }
    if (grade && grade !== 'all') where.student = { grade: Number(grade) };
    if (category && category !== 'all') where.violation = { category };

    const rows = await db.incidents.findMany({
      where,
      select: {
        status: true,
        student: { select: { grade: true } },
        violation: { select: { category: true } },
      },
    });

    const total = rows.length;
    const open = rows.filter((r) => r.status === 'Open').length;
    const pending = rows.filter((r) => r.status === 'Pending').length;
    const resolved = rows.filter((r) => r.status === 'Resolved').length;

    const byCategory = groupCounts(rows.map((r) => r.violation?.category ?? ''))
      .map(({ key: c, count }) => ({ category: c, count }))
      .sort((a, b) => b.count - a.count);

    const byGrade = groupCounts(rows.map((r) => r.student?.grade ?? 0))
      .map(({ key: g, count }) => ({ grade: g, count }))
      .sort((a, b) => a.grade - b.grade);

    return NextResponse.json({ total, open, pending, resolved, byCategory, byGrade });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
