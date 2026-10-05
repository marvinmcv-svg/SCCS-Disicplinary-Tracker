// POST /api/notifications/send — port of sccs/server/routes/index.ts:1396.
//
// Reports the truth: this endpoint used to log a line and return success, so
// staff saw "parent contacted" when nothing had been sent. Email is NOT
// configured in this environment, so it answers 503 and tells the caller to
// contact the parent directly.
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, canRecordIncidents, forbidden } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req, user) => {
  if (!canRecordIncidents(user)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
  const { recipient_email, message } = body ?? {};

  if (!recipient_email || !message) {
    return NextResponse.json(
      { error: 'Recipient email and message are required' },
      { status: 400 },
    );
  }

  // Mailer is not configured on this server.
  return NextResponse.json(
    {
      error:
        'Email is not configured on this server, so no message was sent. ' +
        'Contact the parent directly and record it on the incident.',
      sent: false,
    },
    { status: 503 },
  );
});
