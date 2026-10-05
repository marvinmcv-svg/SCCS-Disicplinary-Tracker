// PUT /api/alerts/[id] — port of sccs/server/routes/index.ts:829.
// Admin only; updates threshold and enabled ('Yes'/'No' text column).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, adminOnly } from '@/lib/sccs-auth';
import { toIntOrNull } from '../../_lib/api-utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!adminOnly(user)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as
      | { threshold?: unknown; enabled?: unknown }
      | null;
    const { threshold, enabled } = body ?? {};

    await db.alerts.updateMany({
      where: { id: Number.parseInt(id, 10) },
      data: {
        threshold: toIntOrNull(threshold) ?? undefined,
        enabled: enabled === undefined || enabled === null ? undefined : String(enabled),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
