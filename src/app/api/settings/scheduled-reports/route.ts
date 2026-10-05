// /api/settings/scheduled-reports — port of sccs/server/routes/index.ts:1451
// (GET) and 1464 (PUT, admin only).
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

// GET — { enabled, email } from the two scheduled_reports_* settings keys.
export const GET = withAuth(async () => {
  try {
    const [setting, emailSetting] = await Promise.all([
      db.settings.findUnique({ where: { key: 'scheduled_reports_enabled' } }),
      db.settings.findUnique({ where: { key: 'scheduled_reports_email' } }),
    ]);
    return NextResponse.json({
      enabled: setting?.value === 'true',
      email: emailSetting?.value || '',
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// PUT — persist both settings keys (admin only; role checked in the handler
// like the original).
export const PUT = withAuth(async (req, user) => {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown; email?: unknown } | null;
    const { enabled, email } = body ?? {};

    await db.settings.upsert({
      where: { key: 'scheduled_reports_enabled' },
      create: { key: 'scheduled_reports_enabled', value: enabled ? 'true' : 'false' },
      update: { value: enabled ? 'true' : 'false' },
    });
    await db.settings.upsert({
      where: { key: 'scheduled_reports_email' },
      create: { key: 'scheduled_reports_email', value: (email as string) || '' },
      update: { value: (email as string) || '' },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
