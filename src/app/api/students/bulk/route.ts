// POST /api/students/bulk — port of sccs/server/routes/index.ts:476.
// The bulk-import path: a plain insert with stock defaults and no validation.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canManageStudents, forbidden } from '@/lib/sccs-auth';
import { toIntOrNull } from '../../_lib/api-utils';

export const dynamic = 'force-dynamic';

interface BulkBody {
  student_id?: unknown;
  last_name?: unknown;
  first_name?: unknown;
  grade?: unknown;
  counselor?: unknown;
  advisory?: unknown;
}

export const POST = withAuth(async (req, user) => {
  try {
    if (!canManageStudents(user)) return forbidden();

    const body = (await req.json().catch(() => null)) as BulkBody | null;
    const { student_id, last_name, first_name, grade, counselor, advisory } = body ?? {};

    // Original: grade || '9' coerced by pg; gpa 0.0 / 100 points / 'Good'.
    const gradeNum = toIntOrNull(grade);
    await db.students.create({
      data: {
        student_id: (student_id ?? '') as string,
        last_name: (last_name ?? '') as string,
        first_name: (first_name ?? '') as string,
        grade: gradeNum ?? 9,
        counselor: (counselor || '') as string,
        advisory: (advisory || '') as string,
        gpa: 0.0,
        total_points: 100,
        conduct_status: 'Good',
        observations: '',
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
