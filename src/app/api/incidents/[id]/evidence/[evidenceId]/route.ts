// DELETE /api/incidents/[id]/evidence/[evidenceId] — port of
// sccs/server/routes/index.ts:1371. Admin only.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, adminOnly, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; evidenceId: string }> };

export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!adminOnly(user)) return forbidden();

    const { id, evidenceId } = await ctx.params;
    await db.incidentEvidence.deleteMany({
      where: { id: Number.parseInt(evidenceId, 10), incident_id: Number.parseInt(id, 10) },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
