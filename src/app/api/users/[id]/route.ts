// /api/users/[id] — port of sccs/server/routes/index.ts:865 (GET), 940 (PUT)
// and 1006 (DELETE, soft). No password column is ever returned.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/sccs-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

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

// GET — one user + computed stats (any authenticated caller, like the original).
export const GET = withAuth<Ctx>(async (_req, _user, ctx) => {
  try {
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = await db.users.findUnique({ where: { id: numericId }, select: USER_SELECT });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Stats for this user (pg `first_name || ' ' || last_name` semantics).
    const fullName =
      user.first_name != null && user.last_name != null
        ? `${user.first_name} ${user.last_name}`
        : null;
    const [assignedStudents, incidentsLogged] = fullName
      ? await Promise.all([
          db.students.count({ where: { counselor: fullName } }),
          db.incidents.count({ where: { reported_by: fullName } }),
        ])
      : [0, 0];

    return NextResponse.json({
      ...user,
      assigned_students_count: assignedStudents,
      incidents_logged_count: incidentsLogged,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// PUT — update a user (admin OR own profile; non-admins cannot change
// role/is_active/2FA).
export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const {
      username,
      role,
      first_name,
      last_name,
      email,
      phone,
      classroom,
      profile_picture,
      newPassword,
      department,
      advisory,
      is_active,
      two_factor_enabled,
    } = body;

    // Allow if admin OR if editing own profile
    if (user.role !== 'admin' && user.userId !== numericId) {
      return NextResponse.json({ error: 'You can only edit your own profile' }, { status: 403 });
    }

    // Non-admins cannot change roles
    if (user.role !== 'admin' && role !== user.role) {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 403 });
    }

    // Only admins can change is_active or two_factor_enabled
    if ((is_active !== undefined || two_factor_enabled !== undefined) && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can modify active status or 2FA settings' },
        { status: 403 },
      );
    }

    // Check for duplicate username
    if (typeof username === 'string' && username) {
      const existingUser = await db.users.findFirst({
        where: { username, id: { not: numericId } },
        select: { id: true },
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'Username already exists. Please choose a different one.' },
          { status: 400 },
        );
      }
    }

    // Password validation if changing (same rules as reset-password)
    if (newPassword) {
      const newPasswordStr = String(newPassword);
      if (newPasswordStr.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 },
        );
      }
      if (!/\d/.test(newPasswordStr)) {
        return NextResponse.json(
          { error: 'Password must contain at least one number' },
          { status: 400 },
        );
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPasswordStr)) {
        return NextResponse.json(
          { error: 'Password must contain at least one special character' },
          { status: 400 },
        );
      }
    }

    const hashedPassword = newPassword ? bcrypt.hashSync(String(newPassword), 10) : null;

    await db.users.updateMany({
      where: { id: numericId },
      data: {
        username: typeof username === 'string' && username ? username : undefined,
        role: typeof role === 'string' && role ? role : undefined,
        first_name: (first_name ?? '') as string,
        last_name: (last_name ?? '') as string,
        email: (email ?? '') as string,
        phone: (phone ?? '') as string,
        classroom: (classroom ?? '') as string,
        profile_picture: (profile_picture ?? '') as string,
        ...(hashedPassword ? { password: hashedPassword } : {}),
        department: (department || null) as string | null,
        advisory: (advisory || null) as string | null,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        two_factor_enabled: two_factor_enabled !== undefined ? Boolean(two_factor_enabled) : false,
      },
    });

    // Log activity
    await db.userActivityLog.create({
      data: {
        user_id: user.userId,
        action: 'UPDATE_USER',
        details: `Updated user: ${username} (ID: ${id})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update error:', (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});

// DELETE — admin only, soft delete (is_active = false).
export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (user.userId === numericId) {
      return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
    }

    // Soft delete - set is_active = false
    await db.users.updateMany({ where: { id: numericId }, data: { is_active: false } });

    // Log activity
    await db.userActivityLog.create({
      data: {
        user_id: user.userId,
        action: 'DEACTIVATE_USER',
        details: `Deactivated user ID: ${id}`,
      },
    });

    return NextResponse.json({ success: true, message: 'User deactivated successfully' });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
