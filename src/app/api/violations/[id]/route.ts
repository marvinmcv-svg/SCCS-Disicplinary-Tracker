// PUT /api/violations/[id] — port of sccs/server/routes/index.ts:507.
// Admin only; updates every column, stringifying progressive_consequences.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, adminOnly } from '@/lib/sccs-auth';
import { toIntOrNull, toBoolOrNull } from '../../_lib/api-utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    // Check admin role (same message the original handler returns).
    if (!adminOnly(user)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const {
      category,
      violation_type,
      description,
      points_deduction,
      default_consequence,
      min_oss_days,
      max_oss_days,
      severity,
      mandatory_parent_contact,
      mandatory_admin_review,
      progressive_consequences,
    } = body;

    // updateMany keeps the original's blind UPDATE semantics.
    await db.violations.updateMany({
      where: { id: Number.parseInt(id, 10) },
      data: {
        category: (category ?? null) as string | null,
        violation_type: (violation_type ?? null) as string | null,
        description: (description ?? null) as string | null,
        points_deduction: toIntOrNull(points_deduction),
        default_consequence: (default_consequence ?? null) as string | null,
        min_oss_days: toIntOrNull(min_oss_days),
        max_oss_days: toIntOrNull(max_oss_days),
        severity: (severity ?? null) as string | null,
        mandatory_parent_contact: toBoolOrNull(mandatory_parent_contact),
        mandatory_admin_review: toBoolOrNull(mandatory_admin_review),
        progressive_consequences: JSON.stringify(progressive_consequences || []),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
