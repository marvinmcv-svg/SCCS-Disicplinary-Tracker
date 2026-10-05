// /api/recognitions — PBIS positive-behaviour recognitions.
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth, canRecognize, canViewSupportPlans, forbidden, getUserRow } from '@/lib/sccs-auth';
import { recognitionSchema, parseBody } from '@/lib/sccs-validation';
import { todayStr } from '../_lib/api-utils';

export const dynamic = 'force-dynamic';

// GET ?student_id=&days=&limit= — newest first, with student names, plus a
// summary block (totals per category, leaderboard) for the Recognition page.
export const GET = withAuth(async (req, user) => {
  try {
    if (!canViewSupportPlans(user)) return forbidden();
    const sp = req.nextUrl.searchParams;
    const where: Prisma.RecognitionsWhereInput = {};
    const studentId = Number.parseInt(sp.get('student_id') ?? '', 10);
    if (!Number.isNaN(studentId)) where.student_id = studentId;
    const days = Number.parseInt(sp.get('days') ?? '', 10);
    if (!Number.isNaN(days) && days > 0) {
      where.date = { gte: new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) };
    }
    const limit = Math.min(Math.max(Number.parseInt(sp.get('limit') ?? '200', 10) || 200, 1), 1000);

    const rows = await db.recognitions.findMany({
      where,
      include: { student: { select: { first_name: true, last_name: true, grade: true, section: true, student_id: true, profile_picture: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });

    const byCategory = new Map<string, number>();
    const byStudent = new Map<number, { student_id: number; first_name: string; last_name: string; grade: number; points: number; count: number }>();
    for (const r of rows) {
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
      const s = byStudent.get(r.student_id) ?? {
        student_id: r.student_id,
        first_name: r.student.first_name,
        last_name: r.student.last_name,
        grade: r.student.grade,
        points: 0,
        count: 0,
      };
      s.points += r.points;
      s.count += 1;
      byStudent.set(r.student_id, s);
    }

    return NextResponse.json({
      total: rows.length,
      points: rows.reduce((n, r) => n + r.points, 0),
      students: byStudent.size,
      byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
      leaders: [...byStudent.values()].sort((a, b) => b.points - a.points || a.last_name.localeCompare(b.last_name)).slice(0, 10),
      items: rows.slice(0, limit).map(({ student, ...r }) => ({
        ...r,
        first_name: student.first_name,
        last_name: student.last_name,
        grade: student.grade,
        section: student.section,
        student_code: student.student_id,
        profile_picture: student.profile_picture,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — award a recognition (any staff role).
export const POST = withAuth(async (req, user) => {
  try {
    if (!canRecognize(user)) return forbidden();
    const parsed = parseBody(recognitionSchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json(parsed.response, { status: 400 });
    const d = parsed.data;

    const student = await db.students.findUnique({ where: { id: d.student_id }, select: { id: true } });
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const me = await getUserRow(user.userId);
    const created = await db.recognitions.create({
      data: {
        student_id: d.student_id,
        category: d.category,
        points: d.points ?? 1,
        note: d.note ?? null,
        date: d.date ?? todayStr(),
        awarded_by: me ? `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim() || me.username : null,
      },
    });
    return NextResponse.json({ id: created.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
