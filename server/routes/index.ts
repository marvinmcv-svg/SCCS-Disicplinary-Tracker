import express, { Request, Response, NextFunction } from 'express';
import { queryAll, queryOne, runQuery } from '../db';
import { UserRow } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { canRecordIncidents, canManageStudents, adminOnly } from '../permissions';
import * as mailer from '../mailer';
import {
  validateBody,
  studentSchema,
  incidentSchema,
  incidentUpdateSchema,
  mtssSchema,
  userCreateSchema,
} from '../validation';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Augment Express Request to include our custom user property
declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; role: string };
    }
  }
}

const router = express.Router();

// JWT_SECRET must come from the environment. A committed fallback secret means
// anyone who can read this repository can forge a token for any account.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Set it to a long random value ' +
    '(e.g. `openssl rand -hex 32`) before starting the server.'
  );
}

/**
 * Login throttling, in two layers.
 *
 * Nothing previously slowed repeated login attempts, so a weak staff password
 * could be brute-forced at full speed.
 *
 * Throttling purely by IP would be wrong here: an entire school sits behind one
 * public address, so one teacher fumbling their password would lock out every
 * colleague. (Measured — a per-IP limit of 20 blocked a valid login from a
 * different account.) So the tight limit is keyed to the *account* being
 * targeted, and the per-IP limit is set high enough to only catch someone
 * spraying many usernames from one host.
 *
 * Both ignore successful logins, so a normal Monday morning never trips them.
 */
const normalizeUsername = (req: Request): string =>
  typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';

/** Tight, per-account: stops a targeted attack on one staff member. */
const perAccountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req, res) => {
    const username = normalizeUsername(req);
    // No username supplied — fall back to IP so the request is still counted.
    // ipKeyGenerator normalizes IPv6 addresses to their /64 prefix.
    return username ? `user:${username}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  message: {
    error: 'Too many failed attempts for this account. Please wait a few minutes and try again.',
  },
});

/** Loose, per-IP: catches username spraying without locking out a school. */
const perIpLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts from this network. Please wait a few minutes and try again.' },
});

/** Password reset requests generate email and database writes; keep them scarce. */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    const username = normalizeUsername(req);
    return username ? `reset:${username}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  message: { error: 'Too many password reset requests. Please wait an hour and try again.' },
});

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/api/auth/login', perIpLoginLimiter, perAccountLoginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    console.log('Login attempt for user:', username);

    const user = await queryOne('SELECT * FROM users WHERE username = $1', [username]);

    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('User found, checking password...');

    let passwordMatch = false;
    try {
      passwordMatch = bcrypt.compareSync(password, user.password);
    } catch (bcryptError: any) {
      console.error('Bcrypt error:', bcryptError.message);
      return res.status(500).json({ error: 'Authentication error' });
    }

    if (!passwordMatch) {
      console.log('Password mismatch for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    console.log('Login successful for user:', username);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error: any) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Password Reset Routes
router.post('/api/auth/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Find user by username
    const user = await queryOne('SELECT * FROM users WHERE username = $1', [username]);
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ message: 'If an account exists with that username, a password reset link will be sent.' });
    }

    // Generate reset token (random 32 character hex)
    const token = require('crypto').randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Delete any existing tokens for this user
    await runQuery('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    // Create new token
    await runQuery(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    // The token must never travel back in this response — returning it here would
    // let anyone who knows a username take over that account.
    if (mailer.isConfigured() && user.email) {
      try {
        await mailer.sendMail({
          to: user.email,
          subject: 'SCCS Discipline Tracker — password reset',
          text:
            `A password reset was requested for your account (${user.username}).\n\n` +
            `Reset code: ${token}\n\n` +
            `This code expires in one hour. If you did not request it, you can ignore ` +
            `this message — your password has not changed.`,
        });
      } catch (mailError: any) {
        // Deliberately swallowed: surfacing a delivery failure here would reveal
        // which usernames exist. The log below still gives an administrator a way
        // to complete the reset by hand.
        console.error(`Password reset email failed for user id ${user.id}:`, mailError.message);
      }
    } else {
      // No email configured, or no address on file. The token goes to the log so
      // an administrator can pass it on out of band. This puts a live credential
      // in the logs — configure SMTP and this path stops being used.
      console.log(
        `Password reset token for user id ${user.id} (expires ${expiresAt.toISOString()}): ${token}`
      );
    }

    res.json({
      message: 'If an account exists with that username, a password reset link will be sent.'
    });
  } catch (error: any) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ error: 'Password reset request failed' });
  }
});

router.post('/api/auth/reset-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Password validation
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/\d/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one special character' });
    }

    // Find valid token
    const resetToken = await queryOne(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update user password
    await runQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, (resetToken as any).user_id]);

    // Mark token as used
    await runQuery('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [(resetToken as any).id]);

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error: any) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

router.get('/api/students', authenticate, async (req: Request, res: Response) => {
  try {
    const students = await queryAll('SELECT * FROM students ORDER BY last_name, first_name');
    res.json(students);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/students/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const student = await queryOne('SELECT * FROM students WHERE id = $1', [parseInt(req.params.id)]);
    res.json(student);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/students', authenticate, canManageStudents, validateBody(studentSchema), async (req: Request, res: Response) => {
  try {
    const {
      student_id, last_name, first_name, grade, section, house_team, counselor, advisory,
      gpa, total_points, conduct_status, observations, date_of_birth,
      parent_name, parent_phone, parent_email, gender, profile_picture
    } = req.body;

    const result = await runQuery(
      `INSERT INTO students (student_id, last_name, first_name, grade, section, house_team, counselor, advisory, gpa, total_points, conduct_status, observations, date_of_birth, parent_name, parent_phone, parent_email, gender, profile_picture)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        student_id, last_name, first_name, grade || 9, section || '', house_team || '',
        counselor || '', advisory || '', gpa || 0, total_points || 100,
        conduct_status || 'Good', observations || '', date_of_birth || '',
        parent_name || '', parent_phone || '', parent_email || '', gender || '', profile_picture || ''
      ]
    );
    res.json({ id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/students/:id', authenticate, canManageStudents, validateBody(studentSchema), async (req: Request, res: Response) => {
  try {
    const {
      student_id, last_name, first_name, grade, section, house_team, counselor, advisory,
      gpa, total_points, conduct_status, observations, date_of_birth,
      parent_name, parent_phone, parent_email, gender, profile_picture
    } = req.body;

    await runQuery(
      `UPDATE students SET
        student_id = $1, last_name = $2, first_name = $3, grade = $4, section = $5,
        house_team = $6, counselor = $7, advisory = $8, gpa = $9, total_points = $10,
        conduct_status = $11, observations = $12, date_of_birth = $13,
        parent_name = $14, parent_phone = $15, parent_email = $16, gender = $17, profile_picture = $18
       WHERE id = $19`,
      [
        student_id || '', last_name || '', first_name || '', grade || 9, section || '',
        house_team || '', counselor || '', advisory || '', gpa || 0, total_points || 100,
        conduct_status || 'Good', observations || '', date_of_birth || '',
        parent_name || '', parent_phone || '', parent_email || '', gender || '', profile_picture || '',
        parseInt(req.params.id)
      ]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/students/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid student id' });
  }

  try {
    // The database now refuses this delete when disciplinary history exists.
    // Check first so the refusal comes back as an explanation rather than a
    // constraint violation, and say how much history is at stake.
    const counts = await queryOne<{ incidents: number; interventions: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM incidents WHERE student_id = $1) AS incidents,
         (SELECT COUNT(*)::int FROM mtss_interventions WHERE student_id = $1) AS interventions`,
      [id]
    );

    const incidents = counts?.incidents ?? 0;
    const interventions = counts?.interventions ?? 0;

    if (incidents > 0 || interventions > 0) {
      const parts = [];
      if (incidents > 0) parts.push(`${incidents} incident${incidents === 1 ? '' : 's'}`);
      if (interventions > 0) {
        parts.push(`${interventions} MTSS intervention${interventions === 1 ? '' : 's'}`);
      }
      return res.status(409).json({
        error:
          `This student has ${parts.join(' and ')} on record and cannot be deleted. ` +
          `Disciplinary history must be preserved — remove those records first if the ` +
          `student was created in error.`,
        incidents,
        interventions,
      });
    }

    const result = await runQuery('DELETE FROM students WHERE id = $1', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete student failed:', error.message);
    res.status(500).json({ error: 'The student could not be deleted.' });
  }
});

router.post('/api/students/bulk', authenticate, canManageStudents, async (req: Request, res: Response) => {
  try {
    const { student_id, last_name, first_name, grade, counselor, advisory } = req.body;
    await runQuery(
      'INSERT INTO students (student_id, last_name, first_name, grade, counselor, advisory, gpa, total_points, conduct_status, observations) VALUES ($1, $2, $3, $4, $5, $6, 0.0, 100, $7, $8)',
      [student_id, last_name, first_name, grade || '9', counselor || '', advisory || '', 'Good', '']
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api/violations', authenticate, async (req: Request, res: Response) => {
  try {
    const violations = await queryAll('SELECT * FROM violations ORDER BY category, violation_type');
    res.json(violations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/violations/categories', authenticate, async (req: Request, res: Response) => {
  try {
    const categories = await queryAll('SELECT DISTINCT category FROM violations ORDER BY category');
    res.json(categories.map((c: { category: string }) => c.category));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/violations/:id', authenticate, async (req: Request, res: Response) => {
  try {
    // Check admin role
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { category, violation_type, description, points_deduction, default_consequence, min_oss_days, max_oss_days, severity, mandatory_parent_contact, mandatory_admin_review, progressive_consequences } = req.body;
    const id = parseInt(req.params.id);

    await runQuery(
      `UPDATE violations SET
        category = $1, violation_type = $2, description = $3, points_deduction = $4,
        default_consequence = $5, min_oss_days = $6, max_oss_days = $7,
        severity = $8, mandatory_parent_contact = $9, mandatory_admin_review = $10,
        progressive_consequences = $11
       WHERE id = $12`,
      [category, violation_type, description, points_deduction, default_consequence, min_oss_days, max_oss_days, severity, mandatory_parent_contact, mandatory_admin_review, JSON.stringify(progressive_consequences || []), id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api/incidents', authenticate, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    const userRole = currentUser.role || 'user'; // Default to most-restricted

    let query = `
      SELECT i.*, s.last_name, s.first_name, s.student_id as student_id_raw,
             s.counselor, s.advisory,
             v.violation_type, v.category
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
    `;
    const params: any[] = [];

    // RBAC: Teachers can only see incidents they reported OR involving their assigned students
    if (userRole === 'teacher' || userRole === 'counselor') {
      // Look up the current user's full name for filtering
      const currentUserData = await queryOne('SELECT first_name, last_name FROM users WHERE id = $1', [currentUser.userId]);
      const fullName = currentUserData ? `${currentUserData.first_name} ${currentUserData.last_name}` : '';
      // Teachers see: incidents they reported OR where they're the counselor/advisory
      query += ` WHERE (i.reported_by = $1 OR s.counselor = $2 OR s.advisory = $3)`;
      params.push(fullName, fullName, fullName);
    }

    query += ' ORDER BY i.date DESC, i.id DESC';

    const incidents = await queryAll(query, params);
    res.json(incidents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/incidents/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const incident = await queryOne(`
      SELECT i.*, s.last_name, s.first_name, s.student_id as student_id_raw, s.grade,
             v.violation_type, v.category
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      WHERE i.id = $1
    `, [parseInt(req.params.id)]);
    res.json(incident);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/incidents', authenticate, canRecordIncidents, validateBody(incidentSchema), async (req: Request, res: Response) => {
  try {
    const { date, time, student_id, violation_id, location, description, witnesses, reported_by, advisor, action_taken, consequence, notes, follow_up_needed, follow_up_date, parent_contacted, contact_date } = req.body;

    const datePrefix = date.replace(/-/g, '').slice(2);
    const count = await queryOne('SELECT COUNT(*) as count FROM incidents WHERE incident_id LIKE $1', [`${datePrefix}%`]);
    const incidentId = `${datePrefix}-${String((count?.count || 0) + 1).padStart(3, '0')}`;

    const violation = await queryOne('SELECT * FROM violations WHERE id = $1', [violation_id]);

    await runQuery(
      `INSERT INTO incidents (incident_id, date, time, student_id, violation_id, location, description, witnesses, reported_by, advisor, action_taken, consequence, points_deducted, days_oss, administrator_id, notes, follow_up_needed, follow_up_date, parent_contacted, contact_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        incidentId,
        date,
        time,
        student_id,
        violation_id,
        location,
        description,
        witnesses,
        reported_by || null,
        advisor,
        action_taken,
        consequence || violation?.default_consequence,
        violation?.points_deduction || -2,
        violation?.max_oss_days || 0,
        req.user!.userId,
        notes,
        follow_up_needed || 'No',
        follow_up_date || null,
        parent_contacted || 'No',
        contact_date || null,
      ]
    );
    res.json({ id: incidentId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/incidents/:id', authenticate, canRecordIncidents, validateBody(incidentUpdateSchema), async (req: Request, res: Response) => {
  try {
    const { status, parent_contacted, contact_date, location, description, witnesses, reported_by, action_taken, consequence, days_iss, days_oss, detention_hours, notes, follow_up_needed, follow_up_date, resolved_date, advisor, violation_id, points_deducted } = req.body;
    const id = parseInt(req.params.id);

    const updates: string[] = [];
    const values: any[] = [];

    if (status !== undefined) {
      // Log status change
      const incident = await queryOne('SELECT status FROM incidents WHERE id = $1', [id]);
      if (incident && incident.status !== status) {
        await runQuery(
          'INSERT INTO incident_status_logs (incident_id, changed_by, previous_status, new_status) VALUES ($1, $2, $3, $4)',
          [id, req.user!.userId, incident.status, status]
        );
      }
      updates.push('status = $' + (values.length + 1)); values.push(status);
    }
    if (parent_contacted !== undefined) { updates.push('parent_contacted = $' + (values.length + 1)); values.push(parent_contacted); }
    if (contact_date !== undefined) { updates.push('contact_date = $' + (values.length + 1)); values.push(contact_date); }
    if (location !== undefined) { updates.push('location = $' + (values.length + 1)); values.push(location); }
    if (description !== undefined) { updates.push('description = $' + (values.length + 1)); values.push(description); }
    if (witnesses !== undefined) { updates.push('witnesses = $' + (values.length + 1)); values.push(witnesses); }
    if (reported_by !== undefined) { updates.push('reported_by = $' + (values.length + 1)); values.push(reported_by); }
    if (action_taken !== undefined) { updates.push('action_taken = $' + (values.length + 1)); values.push(action_taken); }
    if (consequence !== undefined) { updates.push('consequence = $' + (values.length + 1)); values.push(consequence); }
    if (days_iss !== undefined) { updates.push('days_iss = $' + (values.length + 1)); values.push(days_iss); }
    if (days_oss !== undefined) { updates.push('days_oss = $' + (values.length + 1)); values.push(days_oss); }
    if (detention_hours !== undefined) { updates.push('detention_hours = $' + (values.length + 1)); values.push(detention_hours); }
    if (notes !== undefined) { updates.push('notes = $' + (values.length + 1)); values.push(notes); }
    if (follow_up_needed !== undefined) { updates.push('follow_up_needed = $' + (values.length + 1)); values.push(follow_up_needed); }
    if (follow_up_date !== undefined) { updates.push('follow_up_date = $' + (values.length + 1)); values.push(follow_up_date); }
    if (resolved_date !== undefined) { updates.push('resolved_date = $' + (values.length + 1)); values.push(resolved_date === null ? null : resolved_date); }
    if (advisor !== undefined) { updates.push('advisor = $' + (values.length + 1)); values.push(advisor); }
    if (violation_id !== undefined) { updates.push('violation_id = $' + (values.length + 1)); values.push(violation_id); }
    if (points_deducted !== undefined) { updates.push('points_deducted = $' + (values.length + 1)); values.push(points_deducted); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await runQuery(`UPDATE incidents SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/incidents/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    await runQuery('DELETE FROM incidents WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api/dashboard/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const total = await queryOne('SELECT COUNT(*) as count FROM incidents');
    const pending = await queryOne("SELECT COUNT(*) as count FROM incidents WHERE status = 'Open'");
    const resolved = await queryOne("SELECT COUNT(*) as count FROM incidents WHERE status = 'Resolved'");
    const byCategory = await queryAll(`
      SELECT v.category, COUNT(*) as count
      FROM incidents i
      JOIN violations v ON i.violation_id = v.id
      GROUP BY v.category
    `);
    const recentIncidents = await queryAll(`
      SELECT i.id, i.incident_id, i.date, i.status, i.last_name, i.first_name, i.violation_type
      FROM (
        SELECT i.*, s.last_name, s.first_name, v.violation_type
        FROM incidents i
        JOIN students s ON i.student_id = s.id
        JOIN violations v ON i.violation_id = v.id
        ORDER BY i.date DESC, i.id DESC
      ) i
      LIMIT 5
    `);

    res.json({
      total: parseInt(total?.count || 0),
      pending: parseInt(pending?.count || 0),
      resolved: parseInt(resolved?.count || 0),
      byCategory,
      recentIncidents
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/mtss', authenticate, async (req: Request, res: Response) => {
  try {
    const { advisor, review_soon, tier } = req.query;
    let query = `
      SELECT m.*, s.last_name, s.first_name
      FROM mtss_interventions m
      JOIN students s ON m.student_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (advisor) {
      params.push(advisor);
      query += ` AND m.advisor = $${params.length}`;
    }

    if (tier) {
      params.push(parseInt(tier as string));
      query += ` AND m.tier = $${params.length}`;
    }

    if (review_soon === 'true') {
      // Show interventions with review_date within next 30 days
      query += ` AND m.review_date IS NOT NULL AND m.review_date != '' AND date(m.review_date) <= date('now', '+30 days') AND date(m.review_date) >= date('now')`;
    }

    query += ' ORDER BY m.start_date DESC';

    const interventions = await queryAll(query, params);
    res.json(interventions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/mtss', authenticate, canManageStudents, validateBody(mtssSchema), async (req: Request, res: Response) => {
  try {
    const { student_id, tier, intervention, advisor, start_date, end_date, progress, notes, intervention_goal, progress_monitoring, review_date, exit_criteria, incident_link, tier_history } = req.body;
    const result = await runQuery(
      `INSERT INTO mtss_interventions (student_id, tier, intervention, advisor, start_date, end_date, progress, notes, intervention_goal, progress_monitoring, review_date, exit_criteria, incident_link, tier_history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [student_id, tier, intervention, advisor || null, start_date, end_date || null, progress || 'Not Started', notes || '', intervention_goal || null, progress_monitoring || null, review_date || null, exit_criteria || null, incident_link || null, JSON.stringify(tier_history || [])]
    );
    res.json({ id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/mtss/:id', authenticate, canManageStudents, async (req: Request, res: Response) => {
  try {
    const { student_id, tier, intervention, advisor, start_date, end_date, progress, notes, intervention_goal, progress_monitoring, review_date, exit_criteria, incident_link, tier_history } = req.body;
    const id = parseInt(req.params.id);
    await runQuery(
      `UPDATE mtss_interventions SET
        student_id = $1, tier = $2, intervention = $3, advisor = $4, start_date = $5,
        end_date = $6, progress = $7, notes = $8,
        intervention_goal = $9, progress_monitoring = $10, review_date = $11,
        exit_criteria = $12, incident_link = $13, tier_history = $14
       WHERE id = $15`,
      [student_id, tier, intervention, advisor || null, start_date, end_date || null, progress || 'Not Started', notes || '', intervention_goal || null, progress_monitoring || null, review_date || null, exit_criteria || null, incident_link || null, JSON.stringify(tier_history || []), id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/mtss/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    await runQuery('DELETE FROM mtss_interventions WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const settings = await queryAll('SELECT * FROM settings');
    const settingsObj: Record<string, string> = {};
    settings.forEach((s: { key: string; value: string }) => { settingsObj[s.key] = s.value; });
    res.json(settingsObj);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/settings', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    await runQuery('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api/alerts', authenticate, async (req: Request, res: Response) => {
  try {
    const alerts = await queryAll('SELECT * FROM alerts ORDER BY id');
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/alerts/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { threshold, enabled } = req.body;
    await runQuery('UPDATE alerts SET threshold = $1, enabled = $2 WHERE id = $3', [threshold, enabled, id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api/users', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get users with stats
    const users = await queryAll(`
      SELECT
        u.id, u.username, u.role, u.first_name, u.last_name,
        u.email, u.phone, u.classroom, u.profile_picture, u.created_at,
        u.department, u.advisory, u.is_active, u.last_login,
        u.two_factor_enabled, u.last_activity,
        (SELECT COUNT(*) FROM students s WHERE s.counselor = u.first_name || ' ' || u.last_name) as assigned_students_count,
        (SELECT COUNT(*) FROM incidents i WHERE i.reported_by = u.first_name || ' ' || u.last_name) as incidents_logged_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/users/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    const user = await queryOne(`
      SELECT id, username, role, first_name, last_name, email, phone, classroom,
             profile_picture, created_at, department, advisory, is_active,
             last_login, two_factor_enabled, last_activity
      FROM users WHERE id = $1`, [id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get stats for this user
    const assignedStudents = await queryOne(
      `SELECT COUNT(*) as count FROM students WHERE counselor = $1`,
      [(user as any).first_name + ' ' + (user as any).last_name]
    );
    const incidentsLogged = await queryOne(
      `SELECT COUNT(*) as count FROM incidents WHERE reported_by = $1`,
      [(user as any).first_name + ' ' + (user as any).last_name]
    );

    (user as any).assigned_students_count = parseInt((assignedStudents as any).count) || 0;
    (user as any).incidents_logged_count = parseInt((incidentsLogged as any).count) || 0;

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/users', authenticate, validateBody(userCreateSchema), async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { username, password, role, first_name, last_name, email, phone, classroom, department, advisory } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Stronger password validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/\d/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one special character' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    await runQuery(
      `INSERT INTO users (username, password, role, first_name, last_name, email, phone, classroom, department, advisory)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [username, hashedPassword, role || 'user', first_name || '', last_name || '', email || '', phone || '', classroom || '', department || '', advisory || '']
    );

    // Log activity
    await runQuery(
      `INSERT INTO user_activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [currentUser.userId, 'CREATE_USER', `Created user: ${username} (${role || 'user'})`]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/users/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    const { id } = req.params;
    const { username, role, first_name, last_name, email, phone, classroom, profile_picture, newPassword, department, advisory, is_active, two_factor_enabled } = req.body;

    // Allow if admin OR if editing own profile
    if (currentUser.role !== 'admin' && currentUser.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'You can only edit your own profile' });
    }

    // Non-admins cannot change roles
    if (currentUser.role !== 'admin' && role !== currentUser.role) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    // Only admins can change is_active or two_factor_enabled
    if ((is_active !== undefined || two_factor_enabled !== undefined) && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can modify active status or 2FA settings' });
    }

    // Check for duplicate username
    const existingUser = await queryOne('SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists. Please choose a different one.' });
    }

    // Password validation if changing
    if (newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      if (!/\d/.test(newPassword)) {
        return res.status(400).json({ error: 'Password must contain at least one number' });
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
        return res.status(400).json({ error: 'Password must contain at least one special character' });
      }
    }

    if (newPassword) {
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      await runQuery(
        `UPDATE users SET username = $1, role = $2, first_name = $3, last_name = $4, email = $5, phone = $6, classroom = $7, profile_picture = $8, password = $9, department = $10, advisory = $11, is_active = $12, two_factor_enabled = $13 WHERE id = $14`,
        [username, role, first_name || '', last_name || '', email || '', phone || '', classroom || '', profile_picture || '', hashedPassword, department || null, advisory || null, is_active !== undefined ? is_active : true, two_factor_enabled !== undefined ? two_factor_enabled : false, id]
      );
    } else {
      await runQuery(
        `UPDATE users SET username = $1, role = $2, first_name = $3, last_name = $4, email = $5, phone = $6, classroom = $7, profile_picture = $8, department = $9, advisory = $10, is_active = $11, two_factor_enabled = $12 WHERE id = $13`,
        [username, role, first_name || '', last_name || '', email || '', phone || '', classroom || '', profile_picture || '', department || null, advisory || null, is_active !== undefined ? is_active : true, two_factor_enabled !== undefined ? two_factor_enabled : false, id]
      );
    }

    // Log activity
    await runQuery(
      `INSERT INTO user_activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [currentUser.userId, 'UPDATE_USER', `Updated user: ${username} (ID: ${id})`]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/users/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    if (currentUser.userId === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Soft delete - set is_active = false
    await runQuery('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);

    // Log activity
    await runQuery(
      `INSERT INTO user_activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [currentUser.userId, 'DEACTIVATE_USER', `Deactivated user ID: ${id}`]
    );

    res.json({ success: true, message: 'User deactivated successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/users/:id/password', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    // Stronger password validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/\d/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one special character' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    await runQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Heartbeat - update last_activity for "Currently Online" indicator
router.put('/api/users/:id/heartbeat', authenticate, async (req: Request, res: Response) => {
  try {
    // Deliberately ignores the :id in the path and uses the caller's own id.
    // Trusting the parameter let any authenticated user mark a colleague as
    // "currently online" and backfill their last_login timestamp.
    const callerId = req.user!.userId;
    await runQuery('UPDATE users SET last_activity = CURRENT_TIMESTAMP, last_login = COALESCE(last_login, CURRENT_TIMESTAMP) WHERE id = $1', [callerId]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user activity log (admin only)
router.get('/api/users/activity', authenticate, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { user_id, action, from_date, to_date, limit = 100 } = req.query;

    let query = `
      SELECT l.*, u.username, u.first_name, u.last_name
      FROM user_activity_log l
      JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (user_id) {
      params.push(user_id);
      query += ` AND l.user_id = $${params.length}`;
    }
    if (action) {
      params.push(action);
      query += ` AND l.action = $${params.length}`;
    }
    if (from_date) {
      params.push(from_date);
      query += ` AND l.created_at >= $${params.length}`;
    }
    if (to_date) {
      params.push(to_date);
      query += ` AND l.created_at <= $${params.length}`;
    }

    params.push(parseInt(limit as string) || 100);
    query += ` ORDER BY l.created_at DESC LIMIT $${params.length}`;

    const logs = await queryAll(query, params);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Log an activity (internal use)
router.post('/api/users/activity', authenticate, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    const { action, details } = req.body;

    await runQuery(
      `INSERT INTO user_activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [currentUser.userId, action || 'UNKNOWN', details || '']
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get unique advisory/homeroom values for dropdowns
router.get('/api/advisories', authenticate, async (req: Request, res: Response) => {
  try {
    const advisories = await queryAll(`
      SELECT DISTINCT advisory FROM students
      WHERE advisory IS NOT NULL AND advisory != ''
      UNION
      SELECT DISTINCT advisory FROM users
      WHERE advisory IS NOT NULL AND advisory != ''
      ORDER BY advisory
    `);
    res.json(advisories.map((a: { advisory: string }) => a.advisory));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reactivate user (admin only)
router.put('/api/users/:id/reactivate', authenticate, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    await runQuery('UPDATE users SET is_active = TRUE WHERE id = $1', [id]);

    // Log activity
    await runQuery(
      `INSERT INTO user_activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [currentUser.userId, 'REACTIVATE_USER', `Reactivated user ID: ${id}`]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;

// Enhanced dashboard stats with date range, grade, and category filters
router.get('/api/dashboard/stats/filtered', authenticate, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, grade, category, status } = req.query;

    let dateFilter = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      dateFilter += ` AND i.date::date >= CAST($${paramIndex} AS date)`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateFilter += ` AND i.date::date <= CAST($${paramIndex} AS date)`;
      params.push(endDate);
      paramIndex++;
    }

    let gradeFilter = '';
    if (grade && grade !== 'all') {
      gradeFilter = ` AND s.grade = $${paramIndex}`;
      params.push(grade);
      paramIndex++;
    }

    let categoryFilter = '';
    if (category && category !== 'all') {
      categoryFilter = ` AND v.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    let statusFilter = '';
    if (status && status !== 'all') {
      statusFilter = ` AND i.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const whereClause = `WHERE 1=1${dateFilter}${gradeFilter}${categoryFilter}${statusFilter}`;

    const total = await queryOne(`SELECT COUNT(*) as count FROM incidents i JOIN students s ON i.student_id = s.id JOIN violations v ON i.violation_id = v.id ${whereClause}`, params);
    const pending = await queryOne(`SELECT COUNT(*) as count FROM incidents i JOIN students s ON i.student_id = s.id JOIN violations v ON i.violation_id = v.id ${whereClause} AND i.status = 'Open'`, params);
    const resolved = await queryOne(`SELECT COUNT(*) as count FROM incidents i JOIN students s ON i.student_id = s.id JOIN violations v ON i.violation_id = v.id ${whereClause} AND i.status = 'Resolved'`, params);

    const byCategory = await queryAll(`
      SELECT v.category, COUNT(*) as count
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      ${whereClause}
      GROUP BY v.category
    `, params);

    const byGrade = await queryAll(`
      SELECT s.grade, COUNT(*) as count
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      ${whereClause}
      GROUP BY s.grade
      ORDER BY s.grade
    `, params);

    const byStatus = await queryAll(`
      SELECT i.status, COUNT(*) as count
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      ${whereClause}
      GROUP BY i.status
    `, params);

    const recentIncidents = await queryAll(`
      SELECT i.id, i.incident_id, i.date, i.status, i.last_name, i.first_name, i.violation_type, i.advisor
      FROM (
        SELECT i.*, s.last_name, s.first_name, v.violation_type
        FROM incidents i
        JOIN students s ON i.student_id = s.id
        JOIN violations v ON i.violation_id = v.id
        ${whereClause}
        ORDER BY i.date DESC, i.id DESC
      ) i
      LIMIT 10
    `, params);

    // Get weekly trend for line chart
    const weeklyTrend = await queryAll(`
      SELECT DATE_TRUNC('week', i.date::date) as week, COUNT(*) as count
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      WHERE i.date::date >= (NOW() - INTERVAL '12 weeks')::date
      ${gradeFilter}${categoryFilter}
      GROUP BY DATE_TRUNC('week', i.date::date)
      ORDER BY week
    `, gradeFilter || categoryFilter ? [grade, category].filter(Boolean) : []);

    res.json({
      total: parseInt(total?.count || 0),
      pending: parseInt(pending?.count || 0),
      resolved: parseInt(resolved?.count || 0),
      byCategory,
      byGrade,
      byStatus,
      recentIncidents,
      weeklyTrend
    });
  } catch (error: any) {
    console.error('Dashboard filtered error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get student count
router.get('/api/dashboard/student-count', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await queryOne('SELECT COUNT(*) as count FROM students');
    res.json({ count: parseInt(result?.count || 0) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get unique grades from students
router.get('/api/dashboard/grades', authenticate, async (req: Request, res: Response) => {
  try {
    const grades = await queryAll('SELECT DISTINCT grade FROM students WHERE grade IS NOT NULL ORDER BY grade');
    res.json(grades.map((g: { grade: string }) => g.grade));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get notification count (unresolved incidents)
router.get('/api/notifications/count', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await queryOne("SELECT COUNT(*) as count FROM incidents WHERE status IN ('Open', 'Pending')");
    res.json({ count: parseInt(result?.count || 0) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Incident Status Logs =====
router.get('/api/incidents/:id/status-logs', authenticate, async (req: Request, res: Response) => {
  try {
    const logs = await queryAll(`
      SELECT l.*, u.first_name || ' ' || u.last_name as changed_by_name
      FROM incident_status_logs l
      LEFT JOIN users u ON l.changed_by = u.id
      WHERE l.incident_id = $1
      ORDER BY l.changed_at DESC
    `, [parseInt(req.params.id)]);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Incident Evidence =====
router.get('/api/incidents/:id/evidence', authenticate, async (req: Request, res: Response) => {
  try {
    const evidence = await queryAll(`
      SELECT e.*, u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM incident_evidence e
      LEFT JOIN users u ON e.uploaded_by = u.id
      WHERE e.incident_id = $1
      ORDER BY e.uploaded_at DESC
    `, [parseInt(req.params.id)]);
    res.json(evidence);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/incidents/:id/evidence', authenticate, canRecordIncidents, async (req: Request, res: Response) => {
  try {
    // Handle multipart form data - extract file info from body
    const { file_name, file_url, file_type } = req.body;
    const incidentId = parseInt(req.params.id);

    await runQuery(
      'INSERT INTO incident_evidence (incident_id, file_name, file_url, file_type, uploaded_by) VALUES ($1, $2, $3, $4, $5)',
      [incidentId, file_name || 'evidence', file_url || '', file_type || 'document', req.user!.userId]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/incidents/:id/evidence/:evidenceId', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    await runQuery('DELETE FROM incident_evidence WHERE id = $1 AND incident_id = $2',
      [parseInt(req.params.evidenceId), parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ===== Escalate to Principal =====
router.put('/api/incidents/:id/escalate', authenticate, canRecordIncidents, async (req: Request, res: Response) => {
  try {
    const { escalated } = req.body;
    await runQuery(
      'UPDATE incidents SET escalated_to_principal = $1, principal_notified_at = $2 WHERE id = $3',
      [escalated, escalated ? new Date().toISOString() : null, parseInt(req.params.id)]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ===== Send Notification =====
router.post('/api/notifications/send', authenticate, canRecordIncidents, async (req: Request, res: Response) => {
  const { incident_id, notification_type, recipient_email, message } = req.body;

  if (!recipient_email || !message) {
    return res.status(400).json({ error: 'Recipient email and message are required' });
  }

  // Report the truth. This endpoint used to log a line and return success, so
  // staff saw "parent contacted" when nothing had been sent. If email is not
  // configured, say so and let the user pick up the phone instead.
  if (!mailer.isConfigured()) {
    return res.status(503).json({
      error:
        'Email is not configured on this server, so no message was sent. ' +
        'Contact the parent directly and record it on the incident.',
      sent: false,
    });
  }

  try {
    const result = await mailer.sendMail({
      to: recipient_email,
      subject: notification_type
        ? `SCCS — ${notification_type}`
        : 'SCCS — Student Conduct Notification',
      text: message,
    });

    if (result.accepted.length === 0) {
      return res.status(502).json({
        error: 'The mail server did not accept the message. Nothing was sent.',
        sent: false,
      });
    }

    await runQuery(
      `INSERT INTO user_activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [
        req.user!.userId,
        'SEND_NOTIFICATION',
        `Incident ${incident_id ?? 'n/a'} — ${notification_type || 'notification'} to ${recipient_email}`,
      ]
    );

    res.json({ success: true, sent: true, messageId: result.messageId });
  } catch (error: any) {
    console.error('Notification send failed:', error.message);
    res.status(502).json({
      error: 'The message could not be sent. Contact the parent directly and record it on the incident.',
      sent: false,
    });
  }
});

// ===== Scheduled Reports Settings =====
router.get('/api/settings/scheduled-reports', authenticate, async (req: Request, res: Response) => {
  try {
    const setting = await queryOne("SELECT value FROM settings WHERE key = 'scheduled_reports_enabled'");
    const emailSetting = await queryOne("SELECT value FROM settings WHERE key = 'scheduled_reports_email'");
    res.json({
      enabled: setting?.value === 'true',
      email: emailSetting?.value || ''
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/settings/scheduled-reports', authenticate, async (req: Request, res: Response) => {
  try {
    const { enabled, email } = req.body;
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    await runQuery("INSERT INTO settings (key, value) VALUES ('scheduled_reports_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [enabled ? 'true' : 'false']);
    await runQuery("INSERT INTO settings (key, value) VALUES ('scheduled_reports_email', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [email || '']);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ===== Reports API =====
router.get('/api/reports/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, grade, category } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (start_date) {
      whereClause += ` AND i.date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      whereClause += ` AND i.date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }
    if (grade && grade !== 'all') {
      whereClause += ` AND s.grade = $${paramIndex}`;
      params.push(grade);
      paramIndex++;
    }
    if (category && category !== 'all') {
      whereClause += ` AND v.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN i.status = 'Open' THEN 1 END) as open,
        COUNT(CASE WHEN i.status = 'Pending' THEN 1 END) as pending,
        COUNT(CASE WHEN i.status = 'Resolved' THEN 1 END) as resolved
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      ${whereClause}
    `, params);

    const byCategory = await queryAll(`
      SELECT v.category, COUNT(*) as count
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      ${whereClause}
      GROUP BY v.category
      ORDER BY count DESC
    `, params);

    const byGrade = await queryAll(`
      SELECT s.grade, COUNT(*) as count
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      ${whereClause}
      GROUP BY s.grade
      ORDER BY s.grade
    `, params);

    res.json({
      total: parseInt(stats?.total || 0),
      open: parseInt(stats?.open || 0),
      pending: parseInt(stats?.pending || 0),
      resolved: parseInt(stats?.resolved || 0),
      byCategory,
      byGrade
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});