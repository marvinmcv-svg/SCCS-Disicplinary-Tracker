// PUT /api/users/[id]/heartbeat — port of sccs/server/routes/index.ts:1062.
// Heartbeat for the "Currently Online" indicator. Deliberately ignores the
// :id in the path and uses the caller's own id from the token — trusting the
// parameter let any user mark a colleague online and backfill their
// last_login timestamp.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (_req, user) => {
  try {
    const callerId = user.userId;
    const now = new Date();
    // last_login = COALESCE(last_login, now)
    const existing = await db.users.findUnique({
      where: { id: callerId },
      select: { last_login: true },
    });
    await db.users.updateMany({
      where: { id: callerId },
      data: { last_activity: now, last_login: existing?.last_login ?? now },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
