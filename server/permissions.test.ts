import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  ROLES,
  requireRole,
  canRecordIncidents,
  canManageStudents,
  adminOnly,
} from './permissions';

/**
 * Authorization matrix.
 *
 * Before this middleware existed the server only ever checked for 'admin', so a
 * teacher could delete a student — and with no foreign keys, silently orphan
 * that student's entire incident history. These tests pin the boundary.
 */

type Guard = (req: Request, res: Response, next: NextFunction) => void;

/** Runs a guard against a role and reports whether it called through. */
function attempt(guard: Guard, role: string | undefined) {
  const req = { user: role === undefined ? undefined : { userId: 1, role } } as Request;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  const next = vi.fn();

  guard(req, res, next);

  return {
    allowed: next.mock.calls.length === 1,
    statusCode: status.mock.calls[0]?.[0],
    body: json.mock.calls[0]?.[0],
  };
}

const expectAllowed = (guard: Guard, role: string) => {
  const r = attempt(guard, role);
  expect(r.allowed, `expected '${role}' to be allowed`).toBe(true);
};

const expectDenied = (guard: Guard, role: string | undefined) => {
  const r = attempt(guard, role);
  expect(r.allowed, `expected '${role}' to be denied`).toBe(false);
  expect(r.statusCode).toBe(403);
};

describe('canRecordIncidents — log and update incidents', () => {
  it('admits the three roles that do disciplinary work', () => {
    expectAllowed(canRecordIncidents, 'admin');
    expectAllowed(canRecordIncidents, 'counselor');
    expectAllowed(canRecordIncidents, 'teacher');
  });

  it("denies the read-only 'user' role", () => {
    expectDenied(canRecordIncidents, 'user');
  });
});

describe('canManageStudents — create and edit student records, manage MTSS', () => {
  it('admits admins and counselors', () => {
    expectAllowed(canManageStudents, 'admin');
    expectAllowed(canManageStudents, 'counselor');
  });

  it('denies teachers, who are read-only on the roster', () => {
    expectDenied(canManageStudents, 'teacher');
  });

  it("denies the read-only 'user' role", () => {
    expectDenied(canManageStudents, 'user');
  });
});

describe('adminOnly — deletes and system settings', () => {
  it('admits admins', () => {
    expectAllowed(adminOnly, 'admin');
  });

  it('denies every other role, including counselors', () => {
    expectDenied(adminOnly, 'counselor');
    expectDenied(adminOnly, 'teacher');
    expectDenied(adminOnly, 'user');
  });
});

describe('failing closed', () => {
  it('denies an unrecognised legacy role rather than defaulting it open', () => {
    for (const guard of [canRecordIncidents, canManageStudents, adminOnly]) {
      expectDenied(guard, 'staff');
      expectDenied(guard, 'principal');
      expectDenied(guard, '');
    }
  });

  it('denies a request with no authenticated user attached', () => {
    for (const guard of [canRecordIncidents, canManageStudents, adminOnly]) {
      expectDenied(guard, undefined);
    }
  });

  it('is not fooled by case or whitespace variations on a real role', () => {
    expectDenied(adminOnly, 'Admin');
    expectDenied(adminOnly, 'ADMIN');
    expectDenied(adminOnly, ' admin');
    expectDenied(adminOnly, 'admin ');
  });

  it('does not treat a role-shaped substring as a match', () => {
    expectDenied(adminOnly, 'administrator');
    expectDenied(adminOnly, 'superadmin');
  });
});

describe('denial response', () => {
  it('returns 403 with a message and no detail about what was required', () => {
    const r = attempt(adminOnly, 'teacher');
    expect(r.statusCode).toBe(403);
    expect(r.body).toEqual({ error: 'You do not have permission to perform this action' });
  });
});

describe('the role list', () => {
  it('is exactly the four roles the Users page offers', () => {
    expect([...ROLES]).toEqual(['admin', 'counselor', 'teacher', 'user']);
  });

  it('grants every role at least as much as the tier below it', () => {
    // admin ⊇ counselor ⊇ teacher ⊇ user, for each guard.
    const tiers = ['user', 'teacher', 'counselor', 'admin'];
    for (const guard of [canRecordIncidents, canManageStudents, adminOnly]) {
      const allowed = tiers.map(role => attempt(guard, role).allowed);
      const firstAllowed = allowed.indexOf(true);
      expect(firstAllowed, 'each guard should admit at least admin').toBeGreaterThanOrEqual(0);
      // Once a tier is allowed, every higher tier must be too.
      expect(allowed.slice(firstAllowed).every(Boolean)).toBe(true);
    }
  });
});

describe('requireRole', () => {
  it('admits exactly the roles it was given', () => {
    const guard = requireRole('counselor');
    expectAllowed(guard, 'counselor');
    expectDenied(guard, 'admin');
    expectDenied(guard, 'teacher');
  });

  it('denies everything when given no roles', () => {
    const guard = requireRole();
    for (const role of ROLES) expectDenied(guard, role);
  });
});
