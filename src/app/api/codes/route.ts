// /api/codes — PlusPortals (Rediker SIS) discipline code sets: penalties,
// actions, served statuses and locations (infractions live in /api/violations
// under category 'PlusPortals'). The pickers on the incident registration form
// read this list, so GET is open to every authenticated user; creating codes
// is admin-only (same RBAC as the violations catalog).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, adminOnly, forbidden } from '@/lib/sccs-auth';
import { disciplineCodeSchema, parseBody } from '@/lib/sccs-validation';

export const dynamic = 'force-dynamic';

// GET — all code sets, grouped: { penalty: [...], action: [...], served: [...], location: [...] }.
// ?group=penalty returns a flat array of that one group. Inactive codes are
// included (flagged) so historical values still resolve.
export const GET = withAuth(async (req) => {
  try {
    const group = req.nextUrl.searchParams.get('group');
    if (group) {
      const rows = await db.disciplineCodes.findMany({
        where: { group },
        orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
      });
      return NextResponse.json(rows);
    }
    const rows = await db.disciplineCodes.findMany({
      orderBy: [{ group: 'asc' }, { sort_order: 'asc' }, { code: 'asc' }],
    });
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      (grouped[row.group] = grouped[row.group] || []).push(row);
    }
    return NextResponse.json(grouped);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — add a code to a set (admin only).
export const POST = withAuth(async (req, user) => {
  try {
    if (!adminOnly(user)) return forbidden();
    const body = await req.json().catch(() => null);
    const parsed = parseBody(disciplineCodeSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }
    const d = parsed.data;

    const dup = await db.disciplineCodes.findUnique({
      where: { group_code: { group: d.group, code: d.code } },
    });
    if (dup) {
      return NextResponse.json(
        { error: `Code ${d.code} already exists in the ${d.group} set` },
        { status: 409 },
      );
    }

    const row = await db.disciplineCodes.create({
      data: {
        group: d.group,
        code: d.code,
        name: d.name,
        description: d.description ?? null,
        detention_hours: d.detention_hours ?? 0,
        days_iss: d.days_iss ?? 0,
        days_oss: d.days_oss ?? 0,
        active: d.active ?? true,
        sort_order: d.sort_order ?? 999,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
