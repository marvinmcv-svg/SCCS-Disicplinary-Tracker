// GET /api/advisories — port of sccs/server/routes/index.ts:1137.
// Distinct non-empty advisory values from students UNION users, sorted.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const [studentRows, userRows] = await Promise.all([
      db.students.findMany({ where: { advisory: { not: null } }, select: { advisory: true } }),
      db.users.findMany({ where: { advisory: { not: null } }, select: { advisory: true } }),
    ]);

    const set = new Set<string>();
    for (const r of studentRows) if (r.advisory && r.advisory !== '') set.add(r.advisory);
    for (const r of userRows) if (r.advisory && r.advisory !== '') set.add(r.advisory);

    return NextResponse.json([...set].sort());
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
