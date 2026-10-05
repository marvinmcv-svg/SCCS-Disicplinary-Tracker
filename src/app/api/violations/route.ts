// GET /api/violations — port of sccs/server/routes/index.ts:489.
// progressive_consequences is a JSON-text column in SQLite (JSONB in pg), so
// it is parsed back into the array the original returned.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';
import { parseJsonColumn } from '../_lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const violations = await db.violations.findMany({
      orderBy: [{ category: 'asc' }, { violation_type: 'asc' }],
    });
    return NextResponse.json(
      violations.map((v) => ({
        ...v,
        progressive_consequences: parseJsonColumn(v.progressive_consequences),
      })),
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
