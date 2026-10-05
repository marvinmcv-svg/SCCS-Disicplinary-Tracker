// /api/mtss/[id] — port of sccs/server/routes/index.ts:771 (PUT) and 790
// (DELETE). PUT is a full-row update like the original's (no validation layer
// there); fields simply absent from the body keep their column values.
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth, canManageStudents, adminOnly, forbidden } from '@/lib/sccs-auth';
import { toIntOrNull } from '../../_lib/api-utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// PUT — full update (counselor/admin only).
export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!canManageStudents(user)) return forbidden();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const {
      student_id,
      tier,
      intervention,
      advisor,
      start_date,
      end_date,
      progress,
      notes,
      intervention_goal,
      progress_monitoring,
      review_date,
      exit_criteria,
      incident_link,
      tier_history,
    } = body;
    const { id } = await ctx.params;

    const data: Prisma.MtssInterventionsUpdateManyInput = {
      student_id: toIntOrNull(student_id) ?? undefined,
      tier: toIntOrNull(tier) ?? undefined,
      intervention: (intervention ?? undefined) as string | undefined,
      advisor: (advisor || null) as string | null,
      start_date: (start_date ?? undefined) as string | undefined,
      end_date: (end_date || null) as string | null,
      progress: (progress || 'Not Started') as string,
      notes: (notes || '') as string,
      intervention_goal: (intervention_goal || null) as string | null,
      progress_monitoring: (progress_monitoring || null) as string | null,
      review_date: (review_date || null) as string | null,
      exit_criteria: (exit_criteria || null) as string | null,
      incident_link: toIntOrNull(incident_link),
      tier_history: JSON.stringify(tier_history || []),
    };

    await db.mtssInterventions.updateMany({
      where: { id: Number.parseInt(id, 10) },
      data,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});

// DELETE — admin only.
export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!adminOnly(user)) return forbidden();

    const { id } = await ctx.params;
    await db.mtssInterventions.deleteMany({ where: { id: Number.parseInt(id, 10) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
