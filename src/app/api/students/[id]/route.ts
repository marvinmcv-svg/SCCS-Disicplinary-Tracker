// /api/students/[id] — port of sccs/server/routes/index.ts:367 (GET),
// 400 (PUT) and 429 (DELETE).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canManageStudents, adminOnly, forbidden } from '@/lib/sccs-auth';
import { studentSchema, parseBody } from '@/lib/sccs-validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET — a single student; res.json(null) when not found (queryOne semantics).
export const GET = withAuth<Ctx>(async (_req, _user, ctx) => {
  try {
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json(null);
    }
    const student = await db.students.findUnique({ where: { id: numericId } });
    return NextResponse.json(student ?? null);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// PUT — full-row update (counselor/admin only, validated).
export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!canManageStudents(user)) return forbidden();

    const body = await req.json().catch(() => null);
    const parsed = parseBody(studentSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }
    const d = parsed.data;
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
    }

    // updateMany = the original's blind UPDATE (0 affected rows is still success).
    await db.students.updateMany({
      where: { id: numericId },
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
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});

// DELETE — admin only; refuses when disciplinary history exists (409).
export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  // adminOnly middleware ran before the handler in the original.
  if (!adminOnly(user)) return forbidden();

  const { id } = await ctx.params;
  const numericId = Number.parseInt(id, 10);
  if (Number.isNaN(numericId)) {
    return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
  }

  try {
    // Check first so the refusal comes back as an explanation rather than a
    // constraint violation, and say how much history is at stake.
    const [incidents, interventions] = await Promise.all([
      db.incidents.count({ where: { student_id: numericId } }),
      db.mtssInterventions.count({ where: { student_id: numericId } }),
    ]);

    if (incidents > 0 || interventions > 0) {
      const parts: string[] = [];
      if (incidents > 0) parts.push(`${incidents} incident${incidents === 1 ? '' : 's'}`);
      if (interventions > 0) {
        parts.push(`${interventions} MTSS intervention${interventions === 1 ? '' : 's'}`);
      }
      return NextResponse.json(
        {
          error:
            `This student has ${parts.join(' and ')} on record and cannot be deleted. ` +
            `Disciplinary history must be preserved — remove those records first if the ` +
            `student was created in error.`,
          incidents,
          interventions,
        },
        { status: 409 },
      );
    }

    const result = await db.students.deleteMany({ where: { id: numericId } });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete student failed:', (error as Error).message);
    return NextResponse.json({ error: 'The student could not be deleted.' }, { status: 500 });
  }
});
