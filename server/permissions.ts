import { Request, Response, NextFunction } from 'express';

/**
 * Role-based authorization.
 *
 * Permission model (master-prompt compliance)
 * -------------------------------------------
 *   admin      — everything; the only role that deletes records or changes settings
 *   principal  — all students/all records in school; creates & edits disciplinary
 *                entries; approves corrections; submits to NTSS; views audit log
 *   counselor  — ASSIGNED students only (students.counselor = their full name);
 *                manages MTSS and student records; updates incident status
 *   teacher    — own classroom students only (students.advisory = their advisory,
 *                or students they counsel); can FLAG (create) incidents but not
 *                edit/resolve them — corrections go through the request/approval flow
 *   staff      — read-only, school-wide roster & incident flags; sensitive fields
 *                (parent contact details) are redacted
 *   parent     — read-only, OWN linked child only (verified parent_student_links)
 *   student    — read-only, own record only
 *   user       — legacy read-only role, treated like staff
 *
 * Fails closed — a role not listed here (empty or unknown) gets read-only access.
 *
 * Lives outside routes/index.ts so it can be unit-tested without a database
 * connection or a JWT secret.
 */

export const ROLES = [
  'admin',
  'principal',
  'counselor',
  'teacher',
  'staff',
  'parent',
  'student',
  'user',
] as const;
export type Role = (typeof ROLES)[number];

export const requireRole =
  (...allowed: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role as Role | undefined;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };

/** Log and (for teachers) flag incidents, upload evidence, escalate. */
export const canRecordIncidents = requireRole('admin', 'principal', 'counselor', 'teacher');

/**
 * Edit disciplinary entries / update status & resolution.
 * Master prompt 1.1: "Only Principal/Administrator can create/edit disciplinary
 * entries" (counselors are the authorized staff who update status/resolution;
 * teachers request corrections instead of editing directly).
 */
export const canEditIncidents = requireRole('admin', 'principal', 'counselor');

/** Create and edit student records and MTSS interventions. */
export const canManageStudents = requireRole('admin', 'counselor');

/** Approve or reject correction requests. */
export const canApproveCorrections = requireRole('admin', 'principal');

/** Mark entries ready for NTSS, validate, submit and retry batches. */
export const canSubmitNTSS = requireRole('admin', 'principal', 'counselor');

/** Full audit-trail visibility (other staff only see their own actions). */
export const canViewAudit = requireRole('admin', 'principal');

/** Destructive operations and system configuration. */
export const adminOnly = requireRole('admin');

/** Staff roles (everything except parents/students). */
export const STAFF_ROLES: Role[] = ['admin', 'principal', 'counselor', 'teacher', 'staff', 'user'];

/** Roles whose data view is scoped to specific students. */
export const SCOPED_ROLES: Role[] = ['counselor', 'teacher', 'parent', 'student'];

/** Roles that can see every student in the school. */
export const SCHOOL_WIDE_ROLES: Role[] = ['admin', 'principal', 'staff', 'user'];

export function isStaffRole(role: string | undefined): boolean {
  return STAFF_ROLES.includes(role as Role);
}
