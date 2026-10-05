// GET /api/health — port of the original server's /api/health
// (sccs/server/index.ts:101). Answers 503 — not 200 — when the database is
// unreachable, so an uptime monitor actually fires.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbConnected = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  return NextResponse.json(
    {
      status: dbConnected ? 'healthy' : 'unhealthy',
      database: dbConnected ? 'connected' : 'disconnected',
      databaseInitialized: dbConnected,
      timestamp: new Date().toISOString(),
    },
    { status: dbConnected ? 200 : 503 },
  );
}
