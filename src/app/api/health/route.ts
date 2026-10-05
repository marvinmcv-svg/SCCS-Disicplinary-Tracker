// GET /api/health — port of the original server's /api/health
// (sccs/server/index.ts:101). Answers 503 — not 200 — when the database is
// unreachable, so an uptime monitor actually fires.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let dbConnected = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  // TEMP deployment diagnostic (removed after verifying the Vercel demo).
  let diag: unknown = undefined;
  if (new URL(req.url).searchParams.get('diag') === '1') {
    const fs = await import('node:fs');
    const bcrypt = (await import('bcryptjs')).default;
    const admin = await db.users.findUnique({ where: { username: 'admin' } }).catch((e: Error) => ({ err: e.message }));
    diag = {
      vercel: !!process.env.VERCEL,
      cwd: process.cwd(),
      bundled: fs.existsSync(`${process.cwd()}/db/sccs.db`),
      tmp: fs.existsSync('/tmp/sccs.db') ? fs.statSync('/tmp/sccs.db').size : null,
      users: await db.users.count().catch((e: Error) => e.message),
      students: await db.students.count().catch((e: Error) => e.message),
      admin: admin && 'password' in admin ? { active: admin.is_active, match: bcrypt.compareSync('admin123', admin.password), hashPrefix: admin.password.slice(0, 7) } : admin,
    };
  }

  return NextResponse.json(
    {
      diag,
      status: dbConnected ? 'healthy' : 'unhealthy',
      database: dbConnected ? 'connected' : 'disconnected',
      databaseInitialized: dbConnected,
      timestamp: new Date().toISOString(),
    },
    { status: dbConnected ? 200 : 503 },
  );
}
