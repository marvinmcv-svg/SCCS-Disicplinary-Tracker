import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request } from 'express';
import { queryOne, runQuery } from './db';

/**
 * Compliance layer: server-side sessions, account lockout, password policy,
 * immutable audit trail and security-event monitoring.
 *
 * Everything here backs the master-prompt checklist:
 *   1.2  sessions: 30-minute inactivity timeout, revocation on logout
 *        (invalidates the token in EVERY tab), expired tokens rejected.
 *   4.3  5 failed logins lock the account for 15 minutes; 12+ character
 *        passwords; no reuse of the last 5 passwords.
 *   2.1  every CUD operation is written to audit_logs (who/what/when/ip);
 *        DB triggers make the table immutable.
 *   6.2  suspicious activity (failed logins, lockouts, denied access,
 *        rate limiting) is recorded in security_events immediately.
 */

/** Idle window before a session is considered abandoned (master prompt 1.2). */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Absolute lifetime cap for a session, even when actively used. */
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
/** Failed logins before the account locks (master prompt 4.3). */
export const MAX_FAILED_LOGINS = 5;
/** How long a lockout lasts (master prompt 4.3). */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
/** Password reset links expire after 30 minutes (master prompt 4.3). */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
/** Number of previous passwords checked for reuse (master prompt 4.3). */
export const PASSWORD_HISTORY_DEPTH = 5;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionInfo {
  jti: string;
  valid: boolean;
  reason?: 'not_found' | 'revoked' | 'expired' | 'idle_timeout' | 'user_inactive';
}

/** Create a session row and return its id (the JWT's `sid` claim). */
export async function createSession(userId: number, req: Request): Promise<string> {
  const jti = crypto.randomUUID();
  await runQuery(
    `INSERT INTO sessions (jti, user_id, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [jti, userId, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 300),
     new Date(Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS)]
  );
  return jti;
}

/**
 * Validate a session and slide its idle timer.
 *
 * Checks, in order: exists → not revoked → not past the absolute expiry →
 * active within the last 30 minutes → user still active. When the idle window
 * has lapsed the session is revoked with reason 'idle_timeout' so the token is
 * dead everywhere, not just on this request.
 */
export async function verifySession(jti: string, userId: number): Promise<SessionInfo> {
  const session = await queryOne<any>(
    `SELECT s.*, u.is_active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.jti = $1`,
    [jti]
  );
  if (!session) return { jti, valid: false, reason: 'not_found' };
  if (session.revoked_at) return { jti, valid: false, reason: 'revoked' };
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await revokeSession(jti, 'expired');
    return { jti, valid: false, reason: 'expired' };
  }
  const idleMs = Date.now() - new Date(session.last_activity).getTime();
  if (idleMs > SESSION_IDLE_TIMEOUT_MS) {
    await revokeSession(jti, 'idle_timeout');
    return { jti, valid: false, reason: 'idle_timeout' };
  }
  if (!session.is_active) {
    await revokeSession(jti, 'user_inactive');
    return { jti, valid: false, reason: 'user_inactive' };
  }
  // Slide the idle timer, but at most one write per minute per session.
  if (idleMs > 60_000) {
    await runQuery('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE jti = $1', [jti]);
  }
  return { jti, valid: true };
}

export async function revokeSession(jti: string, reason: string): Promise<void> {
  await runQuery(
    'UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2 WHERE jti = $1 AND revoked_at IS NULL',
    [jti, reason]
  );
}

/** Revoke every session for a user (password change, deactivation). */
export async function revokeAllSessions(userId: number, reason: string, exceptJti?: string): Promise<void> {
  await runQuery(
    'UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL AND ($3::text IS NULL OR jti != $3)',
    [userId, reason, exceptJti ?? null]
  );
}

// ---------------------------------------------------------------------------
// Login lockout
// ---------------------------------------------------------------------------

export interface LockoutStatus {
  locked: boolean;
  minutesRemaining?: number;
  failedAttempts: number;
}

export async function getLockoutStatus(user: { locked_until: string | Date | null; failed_login_attempts: number }): Promise<LockoutStatus> {
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return {
      locked: true,
      minutesRemaining: Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000),
      failedAttempts: user.failed_login_attempts ?? 0,
    };
  }
  return { locked: false, failedAttempts: user.failed_login_attempts ?? 0 };
}

/**
 * Count a failed login. At MAX_FAILED_LOGINS the account locks for
 * LOCKOUT_DURATION_MS and a security event is raised.
 */
export async function registerFailedLogin(
  user: { id: number; username: string; failed_login_attempts: number },
  req: Request
): Promise<LockoutStatus> {
  const attempts = (user.failed_login_attempts ?? 0) + 1;
  const willLock = attempts >= MAX_FAILED_LOGINS;
  const lockedUntil = willLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
  await runQuery(
    'UPDATE users SET failed_login_attempts = $2, locked_until = $3 WHERE id = $1',
    [user.id, willLock ? 0 : attempts, lockedUntil]
  );
  if (willLock) {
    // 6.2 suspicious activity: an account hitting the lockout threshold.
    await recordSecurityEvent('ACCOUNT_LOCKOUT', 'warning', user.id, user.username, {
      reason: `${MAX_FAILED_LOGINS} failed logins`,
      lockoutMinutes: LOCKOUT_DURATION_MS / 60000,
    }, req);
    await auditEvent('ACCOUNT_LOCKOUT', {
      userId: user.id, username: user.username, req,
      label: `Account locked for ${LOCKOUT_DURATION_MS / 60000} minutes after ${MAX_FAILED_LOGINS} failed logins`,
    });
  }
  return { locked: willLock, failedAttempts: attempts, minutesRemaining: willLock ? LOCKOUT_DURATION_MS / 60000 : undefined };
}

export async function registerSuccessfulLogin(userId: number): Promise<void> {
  await runQuery(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = $1',
    [userId]
  );
}

// ---------------------------------------------------------------------------
// Password policy & history (4.3)
// ---------------------------------------------------------------------------

/**
 * Master prompt 4.3: minimum 12 characters, uppercase, lowercase, number and
 * symbol. Returns the first violation as a plain-language message, or null.
 */
export function passwordPolicyError(password: string): string | null {
  if (!password || password.length < 12) return 'Password must be at least 12 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*(),.?":{}|<>\[\]\\\/~`+\-_=;']/.test(password)) return 'Password must contain at least one symbol';
  return null;
}

/** True when the new password reuses one of the last PASSWORD_HISTORY_DEPTH hashes. */
export async function isPasswordReused(userId: number, newPassword: string): Promise<boolean> {
  const history = await queryAll_(`
    SELECT password_hash FROM (
      SELECT password_hash, changed_at FROM password_history WHERE user_id = $1
      UNION ALL
      SELECT password, changed_at FROM users WHERE id = $1
    ) h ORDER BY changed_at DESC LIMIT $2`,
    [userId, PASSWORD_HISTORY_DEPTH]
  );
  return history.some(row => bcrypt.compareSync(newPassword, row.password_hash));
}

/** Record the new hash in the rolling history (keeps the newest 5 + current). */
export async function addPasswordHistory(userId: number, newHash: string): Promise<void> {
  await runQuery('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [userId, newHash]);
  // Trim anything beyond the reuse window (plus one generation of slack).
  await runQuery(
    `DELETE FROM password_history WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM password_history WHERE user_id = $1 ORDER BY changed_at DESC LIMIT $2)`,
    [userId, PASSWORD_HISTORY_DEPTH + 1]
  );
}

async function queryAll_(sql: string, params: any[] = []): Promise<any[]> {
  const { queryAll } = await import('./db');
  return queryAll(sql, params);
}

// ---------------------------------------------------------------------------
// Audit trail (2.1) — WHO / WHAT / WHEN / IP
// ---------------------------------------------------------------------------

export interface AuditChange {
  field: string;
  from: any;
  to: any;
}

export interface AuditOptions {
  entityType?: string;
  entityId?: string | number;
  label?: string;
  changes?: AuditChange[];
  /** For unauthenticated events (e.g. failed logins). */
  userId?: number;
  username?: string;
  role?: string;
}

/**
 * Append one immutable audit row. Password values are NEVER written — callers
 * describe the change ("password changed") without the value (4.4).
 *
 * Use `audit(req, action, opts)` for authenticated requests and
 * `auditEvent(action, opts)` for unauthenticated ones (failed logins, lockouts).
 */
export async function audit(req: Request, action: string, opts: AuditOptions = {}): Promise<void> {
  await writeAuditRow(req, action, opts);
}

export async function auditEvent(action: string, opts: AuditOptions & { req?: Request } = {}): Promise<void> {
  await writeAuditRow(opts.req ?? null, action, opts);
}

async function writeAuditRow(req: Request | null, action: string, options: AuditOptions): Promise<void> {
  const user = (req as any)?.user as { userId?: number; role?: string } | undefined;
  const userId = options.userId ?? user?.userId ?? null;
  const username = options.username ?? null;
  const role = options.role ?? user?.role ?? null;
  const ip = clientIp(req);
  const userAgent = req ? String(req.headers['user-agent'] || '').slice(0, 300) : null;

  try {
    await runQuery(
      `INSERT INTO audit_logs (user_id, username, role, action, entity_type, entity_id, entity_label, changes, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
      [userId, username, role, action, options.entityType ?? null,
       options.entityId !== undefined ? String(options.entityId) : null,
       options.label ?? null,
       JSON.stringify(options.changes ?? []),
       ip, userAgent]
    );
  } catch (e: any) {
    // The audit trail must never break the operation it is recording; failures
    // are logged and visible to the operator.
    console.error('audit write failed:', e.message);
  }
}

/** Build an old→new diff over the given fields. */
export function diffFields(
  oldRow: Record<string, any> | null,
  newRow: Record<string, any>,
  fields: string[]
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const before = oldRow ? oldRow[field] : null;
    const after = newRow[field];
    if (String(before ?? '') !== String(after ?? '')) {
      changes.push({ field, from: before ?? null, to: after ?? null });
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Security events (6.2)
// ---------------------------------------------------------------------------

export async function recordSecurityEvent(
  eventType: string,
  severity: 'info' | 'warning' | 'critical',
  userId: number | null,
  username: string | null,
  details: Record<string, any>,
  req: Request
): Promise<void> {
  try {
    await runQuery(
      `INSERT INTO security_events (event_type, severity, user_id, username, details, ip)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [eventType, severity, userId, username, JSON.stringify(details), clientIp(req)]
    );
  } catch (e: any) {
    console.error('security event write failed:', e.message);
  }
}

// ---------------------------------------------------------------------------

export function clientIp(req: Request | null): string {
  if (!req) return 'unknown';
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.ip || 'unknown';
}
