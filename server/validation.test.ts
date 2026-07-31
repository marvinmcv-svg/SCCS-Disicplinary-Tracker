import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  validateBody,
  studentSchema,
  incidentSchema,
  incidentUpdateSchema,
  mtssSchema,
  userCreateSchema,
} from './validation';

/**
 * Before this layer, endpoints destructured whatever arrived and wrote it
 * straight to the database with `field || ''` defaults. These tests pin both
 * halves of the contract: junk is rejected with a usable message, and ordinary
 * input from the existing forms still passes.
 */

function run(schema: Parameters<typeof validateBody>[0], body: unknown) {
  const req = { body } as Request;
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }), json } as unknown as Response;
  const next = vi.fn() as NextFunction;

  validateBody(schema)(req, res, next);

  return {
    passed: (next as any).mock.calls.length === 1,
    body: req.body,
    status: (res.status as any).mock.calls[0]?.[0],
    error: json.mock.calls[0]?.[0],
  };
}

const validStudent = { student_id: '001', last_name: 'RIBERA', first_name: 'RUDDY' };

describe('studentSchema', () => {
  it('accepts a minimal record', () => {
    expect(run(studentSchema, validStudent).passed).toBe(true);
  });

  it('requires the identifying fields', () => {
    for (const field of ['student_id', 'last_name', 'first_name']) {
      const r = run(studentSchema, { ...validStudent, [field]: '' });
      expect(r.passed, `${field} should be required`).toBe(false);
      expect(r.status).toBe(400);
      expect(r.error.fieldErrors).toHaveProperty(field);
    }
  });

  it('reports the offending field so the UI can mark the input', () => {
    const r = run(studentSchema, { ...validStudent, parent_email: 'not-an-email' });
    expect(r.passed).toBe(false);
    expect(r.error.fieldErrors.parent_email).toMatch(/valid email/i);
  });

  it('accepts Pre-K, whose grade is the falsy value 0', () => {
    const r = run(studentSchema, { ...validStudent, grade: 0 });
    expect(r.passed).toBe(true);
    expect(r.body.grade).toBe(0);
  });

  it("parses the import format '7A' into a numeric grade", () => {
    const r = run(studentSchema, { ...validStudent, grade: '7A' });
    expect(r.passed).toBe(true);
    expect(r.body.grade).toBe(7);
  });

  it('rejects a grade outside Pre-K to 12', () => {
    expect(run(studentSchema, { ...validStudent, grade: 13 }).passed).toBe(false);
    expect(run(studentSchema, { ...validStudent, grade: -1 }).passed).toBe(false);
    expect(run(studentSchema, { ...validStudent, grade: 'senior' }).passed).toBe(false);
  });

  it('trims whitespace and normalises section to upper case', () => {
    const r = run(studentSchema, { ...validStudent, last_name: '  RIBERA  ', section: 'a' });
    expect(r.body.last_name).toBe('RIBERA');
    expect(r.body.section).toBe('A');
  });

  it('treats a blank optional field as absent rather than an empty string', () => {
    const r = run(studentSchema, { ...validStudent, parent_email: '', counselor: '' });
    expect(r.passed).toBe(true);
    expect(r.body.parent_email).toBeUndefined();
    expect(r.body.counselor).toBeUndefined();
  });

  it('rejects an observations field long enough to be an attack or a mistake', () => {
    expect(run(studentSchema, { ...validStudent, observations: 'x'.repeat(5001) }).passed).toBe(false);
  });

  it('drops unknown fields instead of rejecting, so older clients keep working', () => {
    const r = run(studentSchema, { ...validStudent, someRemovedField: 'legacy' });
    expect(r.passed).toBe(true);
    expect(r.body).not.toHaveProperty('someRemovedField');
  });

  it('does not let a client set fields it has no business setting', () => {
    const r = run(studentSchema, { ...validStudent, id: 999, created_at: '1999-01-01' });
    expect(r.body).not.toHaveProperty('id');
    expect(r.body).not.toHaveProperty('created_at');
  });

  it('rejects a phone number containing letters', () => {
    expect(run(studentSchema, { ...validStudent, parent_phone: 'call me' }).passed).toBe(false);
    expect(run(studentSchema, { ...validStudent, parent_phone: '+591 700-12345' }).passed).toBe(true);
  });
});

describe('incidentSchema', () => {
  const valid = { date: '2026-07-20', student_id: 1, violation_id: 2 };

  it('accepts a minimal incident', () => {
    expect(run(incidentSchema, valid).passed).toBe(true);
  });

  it('requires a student and a violation', () => {
    expect(run(incidentSchema, { ...valid, student_id: undefined }).passed).toBe(false);
    expect(run(incidentSchema, { ...valid, violation_id: 0 }).passed).toBe(false);
  });

  it('coerces numeric ids arriving as strings from a form', () => {
    const r = run(incidentSchema, { ...valid, student_id: '5', violation_id: '9' });
    expect(r.passed).toBe(true);
    expect(r.body.student_id).toBe(5);
    expect(r.body.violation_id).toBe(9);
  });

  it('rejects a malformed date', () => {
    expect(run(incidentSchema, { ...valid, date: '20/07/2026' }).passed).toBe(false);
    expect(run(incidentSchema, { ...valid, date: 'yesterday' }).passed).toBe(false);
  });
});

describe('incidentUpdateSchema', () => {
  it('accepts the three statuses the app actually uses', () => {
    for (const status of ['Open', 'Pending', 'Resolved']) {
      expect(run(incidentUpdateSchema, { status }).passed, status).toBe(true);
    }
  });

  it('rejects a status the dashboard queries would ignore', () => {
    expect(run(incidentUpdateSchema, { status: 'Closed' }).passed).toBe(false);
    expect(run(incidentUpdateSchema, { status: 'open' }).passed).toBe(false);
  });

  it('rejects an implausible suspension length', () => {
    expect(run(incidentUpdateSchema, { days_oss: 400 }).passed).toBe(false);
    expect(run(incidentUpdateSchema, { days_oss: -1 }).passed).toBe(false);
    expect(run(incidentUpdateSchema, { days_oss: 3 }).passed).toBe(true);
  });

  it('allows a partial update', () => {
    expect(run(incidentUpdateSchema, { notes: 'Spoke with parent' }).passed).toBe(true);
    expect(run(incidentUpdateSchema, {}).passed).toBe(true);
  });
});

describe('mtssSchema', () => {
  const valid = { student_id: 1, tier: 2, intervention: 'Daily check-in', start_date: '2026-07-20' };

  it('accepts a valid intervention', () => {
    expect(run(mtssSchema, valid).passed).toBe(true);
  });

  it('constrains the tier to 1-3', () => {
    expect(run(mtssSchema, { ...valid, tier: 4 }).passed).toBe(false);
    expect(run(mtssSchema, { ...valid, tier: 0 }).passed).toBe(false);
  });

  it('requires a description of the intervention', () => {
    expect(run(mtssSchema, { ...valid, intervention: '   ' }).passed).toBe(false);
  });
});

describe('userCreateSchema', () => {
  const valid = { username: 'jsmith', password: 'GoodPass1!' };

  it('accepts a valid staff account', () => {
    expect(run(userCreateSchema, valid).passed).toBe(true);
  });

  it('enforces the same password rules as the reset flow', () => {
    expect(run(userCreateSchema, { ...valid, password: 'short1!' }).passed).toBe(false);
    expect(run(userCreateSchema, { ...valid, password: 'nodigits!!' }).passed).toBe(false);
    expect(run(userCreateSchema, { ...valid, password: 'nospecial1' }).passed).toBe(false);
  });

  it('rejects a username with characters that complicate lookups', () => {
    expect(run(userCreateSchema, { ...valid, username: 'j smith' }).passed).toBe(false);
    expect(run(userCreateSchema, { ...valid, username: "j'; DROP TABLE users;--" }).passed).toBe(false);
    expect(run(userCreateSchema, { ...valid, username: 'j.smith-2_x' }).passed).toBe(true);
  });

  it('only allows the four real roles, so an unknown role cannot be stored', () => {
    expect(run(userCreateSchema, { ...valid, role: 'admin' }).passed).toBe(true);
    expect(run(userCreateSchema, { ...valid, role: 'superadmin' }).passed).toBe(false);
    expect(run(userCreateSchema, { ...valid, role: 'principal' }).passed).toBe(false);
  });
});
