// /api/students — port of sccs/server/routes/index.ts:358 (GET) and 376 (POST).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canManageStudents, forbidden } from '@/lib/sccs-auth';
import { studentSchema, parseBody } from '@/lib/sccs-validation';

export const dynamic = 'force-dynamic';

// GET /api/students — every student, ordered by name.
export const GET = withAuth(async () => {
  try {
    const students = await db.students.findMany({
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
    });
    return NextResponse.json(students);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST /api/students — create (counselor/admin only, validated).
export const POST = withAuth(async (req, user) => {
  try {
    if (!canManageStudents(user)) return forbidden();

    const body = await req.json().catch(() => null);
    const parsed = parseBody(studentSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }
    const d = parsed.data;

    // `||` defaults mirror the original insert exactly (e.g. grade 0 → 9).
    const created = await db.students.create({
      data: {
        student_id: d.student_id,
        last_name: d.last_name,
        first_name: d.first_name,
        grade: d.grade || 9,
        section: d.section ?? '',
        house_team: d.house_team ?? '',
        counselor: d.counselor ?? '',
        advisory: d.advisory ?? '',
        gpa: d.gpa || 0,
        total_points: d.total_points || 100,
        conduct_status: d.conduct_status || 'Good',
        observations: d.observations ?? '',
        date_of_birth: d.date_of_birth ?? '',
        parent_name: d.parent_name ?? '',
        parent_phone: d.parent_phone ?? '',
        parent_email: d.parent_email ?? '',
        gender: d.gender ?? '',
        profile_picture: d.profile_picture ?? '',
      },
    });
    return NextResponse.json({ id: created.id });
  } catch (error) {
    // e.g. duplicate student_id → unique constraint error, like the original's 400.
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
