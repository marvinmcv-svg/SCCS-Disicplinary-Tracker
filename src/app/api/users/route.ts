// /api/users — port of sccs/server/routes/index.ts:840 (GET, admin only) and
// 899 (POST, admin only, validated). The password column is NEVER selected.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { withAuth, isAdminLike, guardAdminAccounts } from '@/lib/sccs-auth';
import { userCreateSchema, parseBody } from '@/lib/sccs-validation';

export const dynamic = 'force-dynamic';

/** Column list of the original SELECT — no password. */
const USER_SELECT = {
  id: true,
  username: true,
  role: true,
  first_name: true,
  last_name: true,
  email: true,
  phone: true,
  classroom: true,
  profile_picture: true,
  created_at: true,
  department: true,
  advisory: true,
  is_active: true,
  last_login: true,
  two_factor_enabled: true,
  last_activity: true,
} as const;

// GET — list users with computed stats (admin only).
export const GET = withAuth(async (_req, user) => {
  try {
    if (!isAdminLike(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const users = await db.users.findMany({
      select: USER_SELECT,
      orderBy: { created_at: 'desc' },
    });

    // assigned_students_count: students whose counselor is this user's full
    // name; incidents_logged_count: incidents reported_by the full name. pg's
    // `first_name || ' ' || last_name` is NULL when either name is NULL (and
    // therefore matches nothing) — same result here. Counts are reduced in JS:
    // two grouped scans instead of per-user subqueries, fine at this scale.
    const [students, incidents] = await Promise.all([
      db.students.findMany({ select: { counselor: true } }),
      db.incidents.findMany({ select: { reported_by: true } }),
    ]);
    const counselorCounts = new Map<string, number>();
    for (const s of students) {
      if (s.counselor) counselorCounts.set(s.counselor, (counselorCounts.get(s.counselor) ?? 0) + 1);
    }
    const reporterCounts = new Map<string, number>();
    for (const i of incidents) {
      if (i.reported_by) reporterCounts.set(i.reported_by, (reporterCounts.get(i.reported_by) ?? 0) + 1);
    }

    const result = users.map((u) => {
      const fullName =
        u.first_name != null && u.last_name != null ? `${u.first_name} ${u.last_name}` : null;
      return {
        ...u,
        assigned_students_count: fullName ? counselorCounts.get(fullName) ?? 0 : 0,
        incidents_logged_count: fullName ? reporterCounts.get(fullName) ?? 0 : 0,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — create a user. Validation runs BEFORE the admin check, mirroring the
// original's middleware order (authenticate → validateBody → handler).
export const POST = withAuth(async (req, user) => {
  try {
    const body = await req.json().catch(() => null);
    const parsed = parseBody(userCreateSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }

    if (!isAdminLike(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { username, password, role, first_name, last_name, email, phone, classroom, department, advisory } =
      parsed.data;
    const denied = await guardAdminAccounts(user, null, role);
    if (denied) return denied;
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    // Stronger password validation (same checks as the original handler).
    const passwordStr = String(password);
    if (passwordStr.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!/\d/.test(passwordStr)) {
      return NextResponse.json({ error: 'Password must contain at least one number' }, { status: 400 });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(passwordStr)) {
      return NextResponse.json(
        { error: 'Password must contain at least one special character' },
        { status: 400 },
      );
    }

    const hashedPassword = bcrypt.hashSync(passwordStr, 10);
    await db.users.create({
      data: {
        username,
        password: hashedPassword,
        role: role || 'user',
        first_name: first_name ?? '',
        last_name: last_name ?? '',
        email: email ?? '',
        phone: phone ?? '',
        classroom: classroom ?? '',
        department: department ?? '',
        advisory: advisory ?? '',
      },
    });

    // Log activity
    await db.userActivityLog.create({
      data: {
        user_id: user.userId,
        action: 'CREATE_USER',
        details: `Created user: ${username} (${role || 'user'})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
