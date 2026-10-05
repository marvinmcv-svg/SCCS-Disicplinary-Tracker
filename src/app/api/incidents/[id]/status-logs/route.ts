// GET /api/incidents/[id]/status-logs — port of sccs/server/routes/index.ts:1324.
// Joined with the changer's name (first_name + ' ' — NULL in pg when either
// name is NULL, so that behavior is preserved here).
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, _user, ctx) => {
  try {
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json([]);
    }

    const logs = await db.incidentStatusLogs.findMany({
      where: { incident_id: numericId },
      orderBy: { changed_at: 'desc' },
    });

    // LEFT JOIN users — manual join, then the pg `u.first_name || ' ' || u.last_name`
    // shape (NULL when either name is NULL).
    const userIds = [...new Set(logs.map((l) => l.changed_by))];
    const users = await db.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, first_name: true, last_name: true },
    });
    const nameMap = new Map<number, string | null>(
      users.map((u) => [
        u.id,
        u.first_name != null && u.last_name != null ? `${u.first_name} ${u.last_name}` : null,
      ]),
    );

    return NextResponse.json(
      logs.map((l) => ({ ...l, changed_by_name: nameMap.get(l.changed_by) ?? null })),
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
