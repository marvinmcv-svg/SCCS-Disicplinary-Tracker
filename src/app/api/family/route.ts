// GET /api/family — what a parent or student account may see: the students
// linked to it through a VERIFIED parent_student_links row (an unverified link
// gives no access), each with their conduct standing, incidents and
// recognitions.
//
// Staff free text is left out (incident descriptions, witnesses, notes and
// recognition notes can name other students), as are counselor/advisory
// assignments and the school's parent contact details.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, isFamilyRole, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, user) => {
  if (!isFamilyRole(user.role)) return forbidden('This view is for family accounts');
  try {
    const links = await db.parentStudentLinks.findMany({
      where: { parent_user_id: user.userId, verified: true },
      select: { student_id: true },
    });
    const students = await db.students.findMany({
      where: { id: { in: links.map((l) => l.student_id) } },
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
      select: {
        id: true,
        student_id: true,
        first_name: true,
        last_name: true,
        grade: true,
        total_points: true,
        conduct_status: true,
        incidents: {
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            date: true,
            location: true,
            consequence: true,
            points_deducted: true,
            days_iss: true,
            days_oss: true,
            detention_hours: true,
            status: true,
            violation: { select: { category: true, violation_type: true } },
          },
        },
        recognitions: {
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          select: { id: true, date: true, category: true, points: true },
        },
      },
    });
    return NextResponse.json({ students });
  } catch (error) {
    console.error('Family view error:', (error as Error).message);
    return NextResponse.json({ error: 'Could not load your students' }, { status: 500 });
  }
});
