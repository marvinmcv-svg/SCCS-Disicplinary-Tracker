// GET /api/auth/passkeys — the signed-in user's fingerprint sign-ins.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, user) => {
  const keys = await db.passkeys.findMany({
    where: { user_id: user.userId },
    select: { id: true, device_label: true, rp_id: true, created_at: true, last_used_at: true },
    orderBy: { created_at: 'desc' },
  });
  return NextResponse.json(keys);
});
