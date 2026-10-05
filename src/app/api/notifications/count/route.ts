// GET /api/notifications/count — port of sccs/server/routes/index.ts:1314.
// Count of unresolved incidents ('Open' or 'Pending').
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const count = await db.incidents.count({ where: { status: { in: ['Open', 'Pending'] } } });
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
