// /api/settings — port of sccs/server/routes/index.ts:799 (GET) and 810 (PUT).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, adminOnly, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

// GET — the whole settings table as a flat { key: value } object.
export const GET = withAuth(async () => {
  try {
    const settings = await db.settings.findMany();
    const settingsObj: Record<string, string> = {};
    settings.forEach((s) => {
      settingsObj[s.key] = s.value;
    });
    return NextResponse.json(settingsObj);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// PUT — upsert one setting (admin only).
export const PUT = withAuth(async (req, user) => {
  try {
    if (!adminOnly(user)) return forbidden();

    const body = (await req.json().catch(() => null)) as
      | { key?: unknown; value?: unknown }
      | null;
    const key = body?.key;
    const value = body?.value;

    if (typeof key !== 'string' || !key) {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
    }
    // INSERT ... ON CONFLICT (key) DO UPDATE SET value = $2
    const valueStr = value === undefined || value === null ? '' : String(value);
    await db.settings.upsert({
      where: { key },
      create: { key, value: valueStr },
      update: { value: valueStr },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
