// GET /api/dashboard/student-count — port of sccs/server/routes/index.ts:1294.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, familyStudentIds } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, user) => {
  try {
    const familyIds = await familyStudentIds(user);
    const count = familyIds ? familyIds.length : await db.students.count();
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
