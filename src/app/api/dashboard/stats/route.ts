// GET /api/dashboard/stats — port of sccs/server/routes/index.ts:687.
// { total, pending (Open), resolved (Resolved), byCategory, recentIncidents }
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';
import { groupCounts } from '../../_lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const rows = await db.incidents.findMany({
      select: { status: true, violation: { select: { category: true } } },
    });

    const total = rows.length;
    const pending = rows.filter((r) => r.status === 'Open').length;
    const resolved = rows.filter((r) => r.status === 'Resolved').length;

    const byCategory = groupCounts(rows.map((r) => r.violation?.category ?? '')).map(
      ({ key: category, count }) => ({ category, count }),
    );

    const recentRows = await db.incidents.findMany({
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 5,
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
    }));

    return NextResponse.json({ total, pending, resolved, byCategory, recentIncidents });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
