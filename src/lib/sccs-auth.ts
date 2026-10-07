// Auth helpers for SCCS Discipline Tracker API routes (Next.js port of the
// original Express JWT middleware in sccs/server/routes/index.ts).
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// The development fallback is public (this repository is public), so it is
// refused on any deployed server: a missing JWT_SECRET there would let anyone
// sign their own admin token.
const DEV_SECRET = 'sccs-dev-secret-fallback-change-me';
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set on this server');
  }
  return DEV_SECRET;
}

export interface AuthUser {
  userId: number;
  role: string;
}

/** Verify the Authorization: Bearer token on a request. Returns null when invalid. */
export function getAuthUser(req: NextRequest): AuthUser | null {
  const header = req.headers.get('authorization') || '';
  const token = header.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret()) as { userId: number; role: string; exp?: number };
    if (typeof decoded?.userId !== 'number' || typeof decoded?.role !== 'string') return null;
    return { userId: decoded.userId, role: decoded.role };
  } catch {
    return null;
  }
}

/** Wrap a handler so it runs only with a valid JWT; replies 401 otherwise. */
export function withAuth<T>(
  handler: (req: NextRequest, user: AuthUser, ctx: T) => Promise<NextResponse> | NextResponse,
) {
  return async (req: NextRequest, ctx: T): Promise<NextResponse> => {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }
    return handler(req, user, ctx);
  };
}

/** Sign a 24h JWT exactly like the original server. */
export function signToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, jwtSecret(), { expiresIn: '24h' });
}

// ---------------------------------------------------------------------------
// Role-based authorization — ported from sccs/server/permissions.ts
// ---------------------------------------------------------------------------
export const ROLES = [
  'admin', 'coordinator', 'principal', 'counselor', 'teacher', 'staff', 'parent', 'student', 'user',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Coordinators run discipline for the school: they can do everything an
 * admin can, except manage admin accounts (see users routes).
 */
export const isAdminLike = (role: string | null | undefined) => role === 'admin' || role === 'coordinator';

export function requireRole(user: AuthUser | null, ...allowed: Role[]): boolean {
  if (!user) return false;
  // Admin-level access always includes coordinators.
  if (user.role === 'coordinator' && allowed.includes('admin')) return true;
  return allowed.includes(user.role as Role);
}

/** Secondary disciplinary referrals are confidential to coordinators. */
export const canViewReferrals = (user: AuthUser) => user.role === 'coordinator';

/** Any staff member may file a referral. */
export const canFileReferrals = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor', 'teacher', 'staff');

/** Log and (for teachers) flag incidents, upload evidence, escalate. */
export const canRecordIncidents = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor', 'teacher');

/** Edit disciplinary entries / update status & resolution. */
export const canEditIncidents = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor');

/** Create and edit student records and MTSS interventions. */
export const canManageStudents = (user: AuthUser) =>
  requireRole(user, 'admin', 'counselor');

/** Read learning-support plans (IEP/504/ELL…) and early-warning insights.
 *  Staff only: these are confidential special-programs records. */
export const canViewSupportPlans = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor', 'teacher', 'staff');

/** Create / edit learning-support plans (case managers). */
export const canManageSupportPlans = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor');

/** Award PBIS recognitions — any staff member working with students. */
export const canRecognize = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor', 'teacher', 'staff');

/** Destructive operations and system configuration (admins and coordinators). */
export const adminOnly = (user: AuthUser) => isAdminLike(user.role);

export const forbidden = (msg = 'You do not have permission to perform this action') =>
  NextResponse.json({ error: msg }, { status: 403 });

/**
 * Coordinators manage every account except admins: they cannot edit,
 * deactivate or reset an admin, or give anyone the admin role. Returns a 403
 * response to send back, or null when the change is allowed.
 */
export async function guardAdminAccounts(
  user: AuthUser,
  targetUserId: number | null,
  newRole?: unknown,
): Promise<NextResponse | null> {
  if (user.role !== 'coordinator') return null;
  if (newRole === 'admin') return forbidden('Only an admin can give the admin role');
  if (targetUserId != null) {
    const target = await db.users.findUnique({ where: { id: targetUserId }, select: { role: true } });
    if (target?.role === 'admin') return forbidden('Only an admin can change an admin account');
  }
  return null;
}

/** Fetch the full user row for the authenticated caller. */
export async function getUserRow(userId: number) {
  return db.users.findUnique({ where: { id: userId } });
}
