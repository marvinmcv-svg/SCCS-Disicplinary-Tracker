// GET /api/version — port of the original server's /api/version
// (sccs/server/index.ts:111). Unauthenticated on purpose.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    // Fallback matches the SPA's built-in CURRENT_VERSION (src/spa/App.tsx)
    // so the update banner never shows without an explicit APP_VERSION bump.
    version: process.env.APP_VERSION || '2.1.0',
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    minAppVersion: process.env.MIN_APP_VERSION || '1.0.0',
  });
}
