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

// Keys the Settings screen edits.
const EDITABLE_KEYS = ['school_name', 'academic_year', 'max_points', 'passing_threshold'];

// PUT — save settings (admins and coordinators). Accepts one setting as
// { key, value } or the whole Settings form as { school_name: …, … }.
export const PUT = withAuth(async (req, user) => {
  try {
    if (!adminOnly(user)) return forbidden();

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
    }
    const entries: [string, unknown][] =
      typeof body.key === 'string' && body.key
        ? [[body.key, body.value]]
        : Object.entries(body).filter(([k]) => EDITABLE_KEYS.includes(k));
    if (entries.length === 0) {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
    }
    await db.$transaction(
      entries.map(([key, value]) => {
        const valueStr = value === undefined || value === null ? '' : String(value);
        return db.settings.upsert({ where: { key }, create: { key, value: valueStr }, update: { value: valueStr } });
      }),
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
