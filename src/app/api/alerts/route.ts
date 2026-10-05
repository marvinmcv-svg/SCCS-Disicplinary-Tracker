// GET /api/alerts — port of sccs/server/routes/index.ts:820.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const alerts = await db.alerts.findMany({ orderBy: { id: 'asc' } });
    return NextResponse.json(alerts);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
