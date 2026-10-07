// GET /api/notifications/count — port of sccs/server/routes/index.ts:1314.
// Count of unresolved incidents ('Open' or 'Pending'), plus new referrals for coordinators.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, user) => {
  try {
    const count = await db.incidents.count({ where: { status: { in: ['Open', 'Pending'] } } });
    // Coordinators also see new disciplinary referrals waiting for them.
    const referrals = user.role === 'coordinator'
      ? await db.disciplinaryReferrals.count({ where: { status: 'New' } })
      : 0;
    return NextResponse.json({ count: count + referrals, referrals });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
