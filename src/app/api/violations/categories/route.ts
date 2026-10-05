// GET /api/violations/categories — port of sccs/server/routes/index.ts:498.
// Distinct categories as a plain array of strings.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const rows = await db.violations.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return NextResponse.json(rows.map((r) => r.category));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
