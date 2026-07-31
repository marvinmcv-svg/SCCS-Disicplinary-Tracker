import { Request, Response, NextFunction } from 'express';

/**
 * Role-based authorization.
 *
 * Permission model
 * ----------------
 *   admin     — everything; the only role that deletes records or changes settings
 *   counselor — everything a teacher can, plus MTSS interventions and editing students
 *   teacher   — log and update incidents; read-only on students
 *   user      — read-only everywhere
 *
 * Reads stay open to every authenticated role: staff need to see the roster and
 * incident history to do their jobs. Writes are gated.
 *
 * Fails closed — a role not listed here (a legacy value, or an empty one) gets
 * read-only access. After deploying this, check the Users page: any staff member
 * who needs to log incidents must hold 'teacher', 'counselor', or 'admin'.
 *
 * Lives outside routes/index.ts so it can be unit-tested without a database
 * connection or a JWT secret.
 */

export const ROLES = ['admin', 'counselor', 'teacher', 'user'] as const;
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

/** Log and update incidents, upload evidence, escalate, notify parents. */
export const canRecordIncidents = requireRole('admin', 'counselor', 'teacher');

/** Create and edit student records and MTSS interventions. */
export const canManageStudents = requireRole('admin', 'counselor');

/** Destructive operations and system configuration. */
export const adminOnly = requireRole('admin');
