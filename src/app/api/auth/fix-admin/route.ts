// POST /api/auth/fix-admin — port of sccs/server/routes/index.ts:187.
//
// Emergency admin unlock. The caller must know ADMIN_FIX_PASSWORD (or
// INITIAL_ADMIN_PASSWORD, the "agreed credentials" — accepted so production
// needs only one env var). On success the admin account is re-activated, the
// lockout cleared, the password reset to the same secret, the new hash
// recorded in password_history, and a fresh session returned.
//
// Unauthenticated account-takeover hatch BY DESIGN: only as safe as the
// secrecy of its secret. Unset (neither env var present) disables it (404).
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken } from '@/lib/sccs-auth';
import { clientIp } from '@/lib/sccs-rate-limit';
import {
  isBlocked,
  recordFailure,
  LOGIN_WINDOW_MS,
  IP_LOGIN_LIMIT,
  IP_LIMIT_MESSAGE,
} from '../../_lib/attempt-limiter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const expected = process.env.ADMIN_FIX_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD;
    if (!expected) {
      // Hatch disabled. The message tells the operator how to enable it.
      return NextResponse.json(
        {
          error:
            'Admin recovery is not configured on this server. ' +
            'Set ADMIN_FIX_PASSWORD (or INITIAL_ADMIN_PASSWORD) in the environment and restart to enable it.',
        },
        { status: 404 },
      );
    }

    const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
    const password = body?.password;

    const ipKey = `ip:${clientIp(req)}`;
    if (isBlocked(ipKey, IP_LOGIN_LIMIT)) {
      return NextResponse.json({ error: IP_LIMIT_MESSAGE }, { status: 429 });
    }

    if (typeof password !== 'string' || password !== expected) {
      recordFailure(ipKey, LOGIN_WINDOW_MS);
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Any account with the admin role counts; prefer the canonical
    // INITIAL_ADMIN_USERNAME / 'admin' username. (ORDER BY username = $1
    // DESC, id ASC in the original.)
    const preferred = process.env.INITIAL_ADMIN_USERNAME || 'admin';
    const admins = await db.users.findMany({
      where: { role: 'admin' },
      orderBy: { id: 'asc' },
    });
    admins.sort((a, b) => Number(b.username === preferred) - Number(a.username === preferred));
    const admin = admins[0];

    if (!admin) {
      recordFailure(ipKey, LOGIN_WINDOW_MS);
      return NextResponse.json({ error: 'No admin account exists' }, { status: 404 });
    }

    const hash = bcrypt.hashSync(password, 10);
    await db.users.update({
      where: { id: admin.id },
      data: {
        password: hash,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      },
    });
    // Keep the password-history audit trail honest for the reset.
    try {
      await db.passwordHistory.create({ data: { user_id: admin.id, password_hash: hash } });
    } catch {
      /* history is best-effort; the reset itself already succeeded */
    }
    console.log(
      `[fix-admin] admin account '${admin.username}' (id ${admin.id}) was reset via the recovery hatch`,
    );

    const token = signToken(admin.id, admin.role);
    return NextResponse.json({
      token,
      user: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        firstName: admin.first_name,
        lastName: admin.last_name,
      },
    });
  } catch (error) {
    console.error('Fix admin error:', (error as Error).message);
    return NextResponse.json({ error: 'Failed to fix admin' }, { status: 500 });
  }
}
