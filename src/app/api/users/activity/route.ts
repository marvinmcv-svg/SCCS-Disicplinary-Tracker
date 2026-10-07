// /api/users/activity — port of sccs/server/routes/index.ts:1076 (GET, admin
// only, filtered) and 1121 (POST — log an activity for the CALLER).
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth, isAdminLike } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

// GET — user activity log (admin only). Filters: user_id, action, from_date,
// to_date, limit (default 100).
export const GET = withAuth(async (req, user) => {
  try {
    if (!isAdminLike(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const userId = sp.get('user_id');
    const action = sp.get('action');
    const fromDate = sp.get('from_date');
    const toDate = sp.get('to_date');
    const limit = sp.get('limit');

    const where: Prisma.UserActivityLogWhereInput = {};
    if (userId) {
      const n = Number.parseInt(userId, 10);
      if (!Number.isNaN(n)) where.user_id = n;
    }
    if (action) where.action = action;
    // Date strings compare like the pg date casts (midnight boundaries).
    if (fromDate || toDate) {
      where.created_at = {
        ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00Z`) } : {}),
        ...(toDate ? { lte: new Date(`${toDate}T00:00:00Z`) } : {}),
      };
    }

    const logs = await db.userActivityLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: Number.parseInt(limit ?? '100', 10) || 100,
    });

    // JOIN users — manual join for username / first_name / last_name.
    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const users = await db.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json(
      logs.map((l) => {
        const u = userMap.get(l.user_id);
        return {
          ...l,
          username: u?.username ?? null,
          first_name: u?.first_name ?? null,
          last_name: u?.last_name ?? null,
        };
      }),
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — log an activity for the caller (internal use).
export const POST = withAuth(async (req, user) => {
  try {
    const body = (await req.json().catch(() => ({}))) as
      | { action?: unknown; details?: unknown }
      | null;
    const { action, details } = body ?? {};

    await db.userActivityLog.create({
      data: {
        user_id: user.userId,
        action: (action as string) || 'UNKNOWN',
        details: (details as string) || '',
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
