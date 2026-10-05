// PUT /api/incidents/[id]/escalate — port of sccs/server/routes/index.ts:1382.
// Flags the incident for the principal and stamps the notification time.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, canRecordIncidents, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!canRecordIncidents(user)) return forbidden();

    const body = (await req.json().catch(() => ({}))) as { escalated?: unknown } | null;
    const escalated = body?.escalated;
    const { id } = await ctx.params;

    await db.incidents.updateMany({
      where: { id: Number.parseInt(id, 10) },
      data: {
        escalated_to_principal: Boolean(escalated),
        // principal_notified_at is a String column in the ported schema — the
        // original stored the ISO string too.
        principal_notified_at: escalated ? new Date().toISOString() : null,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
