// /api/incidents/[id]/evidence — port of sccs/server/routes/index.ts:1340
// (GET) and 1355 (POST).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canRecordIncidents, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET — evidence rows joined with the uploader's name.
export const GET = withAuth<Ctx>(async (_req, _user, ctx) => {
  try {
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json([]);
    }

    const evidence = await db.incidentEvidence.findMany({
      where: { incident_id: numericId },
      orderBy: { uploaded_at: 'desc' },
    });

    // LEFT JOIN users — manual join, pg `first_name || ' ' || last_name` shape.
    const userIds = [...new Set(evidence.map((e) => e.uploaded_by))];
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
      evidence.map((e) => ({ ...e, uploaded_by_name: nameMap.get(e.uploaded_by) ?? null })),
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — record an evidence row. The original read JSON fields but the SPA
// posts multipart FormData (which express.json never parsed), so the defaults
// were used; req.json() failing here reproduces exactly that outcome.
export const POST = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!canRecordIncidents(user)) return forbidden();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const { file_name, file_url, file_type } = body ?? {};
    const { id } = await ctx.params;
    const incidentId = Number.parseInt(id, 10);

    await db.incidentEvidence.create({
      data: {
        incident_id: incidentId,
        file_name: (file_name as string) || 'evidence',
        file_url: (file_url as string) || '',
        file_type: (file_type as string) || 'document',
        uploaded_by: user.userId,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
