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

    // Required columns are only written when a usable value arrives — a
    // blank number field or a cleared category used to send null and fail
    // the whole save. Nullable text columns may still be cleared.
    const text = (v: unknown) =>
      typeof v === 'string' && v.trim() !== '' ? v : undefined;
    const int = (v: unknown) => toIntOrNull(v) ?? undefined;
    const bool = (v: unknown) => toBoolOrNull(v) ?? undefined;

    const { count } = await db.violations.updateMany({
      where: { id: Number.parseInt(id, 10) },
      data: {
        category: text(category),
        violation_type: text(violation_type),
        description: (description ?? null) as string | null,
        points_deduction: int(points_deduction),
        default_consequence: (default_consequence ?? null) as string | null,
        min_oss_days: int(min_oss_days),
        max_oss_days: int(max_oss_days),
        severity: text(severity),
        mandatory_parent_contact: bool(mandatory_parent_contact),
        mandatory_admin_review: bool(mandatory_admin_review),
        progressive_consequences: JSON.stringify(progressive_consequences || []),
      },
    });
    if (count === 0) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
