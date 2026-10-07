// POST /api/auth/login — port of sccs/server/routes/index.ts:112.
//
// Login throttling, in two layers (failures only — successes never count):
//   - per-IP:     150 failures / 15 min (catches username spraying)
//   - per-account: 10 failures / 15 min (stops a targeted attack)
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
  ACCOUNT_LOGIN_LIMIT,
  IP_LIMIT_MESSAGE,
  ACCOUNT_LIMIT_MESSAGE,
} from '../../_lib/attempt-limiter';

export const dynamic = 'force-dynamic';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as LoginBody | null;
    const username = body?.username;
    const password = body?.password;

    // Limiter keys, mirroring the original keyGenerator (normalized username,
    // IP fallback when no username was supplied).
    const ipKey = `ip:${clientIp(req)}`;
    const normalized =
      typeof username === 'string' ? username.trim().toLowerCase() : '';
    const accountKey = normalized ? `user:${normalized}` : ipKey;

    // Check both limits BEFORE verifying credentials; only failures are
    // recorded (express skipSuccessfulRequests semantics).
    if (isBlocked(ipKey, IP_LOGIN_LIMIT)) {
      return NextResponse.json({ error: IP_LIMIT_MESSAGE }, { status: 429 });
    }
    if (isBlocked(accountKey, ACCOUNT_LOGIN_LIMIT)) {
      return NextResponse.json({ error: ACCOUNT_LIMIT_MESSAGE }, { status: 429 });
    }

    if (!username || !password) {
      recordFailure(ipKey, LOGIN_WINDOW_MS);
      recordFailure(accountKey, LOGIN_WINDOW_MS);
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    console.log('Login attempt for user:', username);

    const user = await db.users.findUnique({ where: { username: String(username) } });

    if (!user) {
      console.log('User not found:', username);
      recordFailure(ipKey, LOGIN_WINDOW_MS);
      recordFailure(accountKey, LOGIN_WINDOW_MS);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    console.log('User found, checking password...');

    let passwordMatch = false;
    try {
      passwordMatch = bcrypt.compareSync(String(password), user.password);
    } catch (bcryptError) {
      console.error('Bcrypt error:', (bcryptError as Error).message);
      return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
    }

    if (!passwordMatch) {
      console.log('Password mismatch for user:', username);
      recordFailure(ipKey, LOGIN_WINDOW_MS);
      recordFailure(accountKey, LOGIN_WINDOW_MS);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!user.is_active) {
      return NextResponse.json({ error: 'This account has been deactivated. Contact a coordinator.' }, { status: 403 });
    }

    const token = signToken(user.id, user.role);
    // Keep last_login fresh for the "Currently Online" indicator.
    await db.users.update({ where: { id: user.id }, data: { last_login: new Date() } });
    console.log('Login successful for user:', username);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (error) {
    console.error('Login error:', (error as Error).message);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
