// GET /api/dashboard/grades — port of sccs/server/routes/index.ts:1304.
// Distinct grades as an ordered array of numbers.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const grades = await db.students.findMany({
      distinct: ['grade'],
      select: { grade: true },
      orderBy: { grade: 'asc' },
    });
    return NextResponse.json(grades.map((g) => g.grade));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
