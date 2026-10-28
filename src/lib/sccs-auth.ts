// Auth helpers for SCCS Discipline Tracker API routes (Next.js port of the
// original Express JWT middleware in sccs/server/routes/index.ts).
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'sccs-dev-secret-fallback-change-me';

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
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string; exp?: number };
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
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '24h' });
}

// ---------------------------------------------------------------------------
// Role-based authorization — ported from sccs/server/permissions.ts
// ---------------------------------------------------------------------------
export const ROLES = [
  'admin', 'principal', 'counselor', 'teacher', 'staff', 'parent', 'student', 'user',
] as const;
export type Role = (typeof ROLES)[number];

export function requireRole(user: AuthUser | null, ...allowed: Role[]): boolean {
  if (!user || !allowed.includes(user.role as Role)) return false;
  return true;
}

/** Log and (for teachers) flag incidents, upload evidence, escalate. */
export const canRecordIncidents = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor', 'teacher');

/** Edit disciplinary entries / update status & resolution. */
export const canEditIncidents = (user: AuthUser) =>
  requireRole(user, 'admin', 'principal', 'counselor');

/** Create and edit student records and MTSS interventions. */
export const canManageStudents = (user: AuthUser) =>
  requireRole(user, 'admin', 'counselor');

/** Destructive operations and system configuration. */
export const adminOnly = (user: AuthUser) => requireRole(user, 'admin');

export const forbidden = (msg = 'You do not have permission to perform this action') =>
  NextResponse.json({ error: msg }, { status: 403 });

/** Fetch the full user row for the authenticated caller. */
export async function getUserRow(userId: number) {
  return db.users.findUnique({ where: { id: userId } });
}

// ---------------------------------------------------------------------------
// Family-account scoping — parents and students may only read the students
// they are verified-linked to in parent_student_links ('user', the default
// role, is treated the same way: most restricted).
// ---------------------------------------------------------------------------
export const isFamilyAccount = (user: AuthUser) => requireRole(user, 'parent', 'student', 'user');

/** Student row ids a family account may see; null for staff (not restricted here). */
export async function familyStudentIds(user: AuthUser): Promise<number[] | null> {
  if (!isFamilyAccount(user)) return null;
  const links = await db.parentStudentLinks.findMany({
    where: { parent_user_id: user.userId, verified: true },
    select: { student_id: true },
  });
  return links.map((l) => l.student_id);
}

/** True when the caller may read this student's records. */
export async function canSeeStudent(user: AuthUser, studentId: number): Promise<boolean> {
  const ids = await familyStudentIds(user);
  return ids === null || ids.includes(studentId);
}

/** True when the caller may read this incident (and its logs / evidence). */
export async function canSeeIncident(user: AuthUser, incidentId: number): Promise<boolean> {
  const ids = await familyStudentIds(user);
  if (ids === null) return true;
  const row = await db.incidents.findUnique({ where: { id: incidentId }, select: { student_id: true } });
  return !!row && ids.includes(row.student_id);
}
