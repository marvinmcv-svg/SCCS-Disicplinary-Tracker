import express, { Request, Response, NextFunction } from 'express';
import { queryAll, queryOne, runQuery } from '../db';
import { UserRow } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Augment Express Request to include our custom user property
declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; role: string };
    }
  }
}

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'discipline-tracker-secret-key';

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

router.post('/api/auth/login', async (req: Request, res: Response) => {
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

router.post('/api/auth/fix-admin', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const FIX_ADMIN_PASSWORD = 'gmc190494';

    if (password !== FIX_ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);

    const existingAdmin = await queryOne("SELECT * FROM users WHERE username = 'admin'");
    let user;
    if (existingAdmin) {
      await runQuery(
        "UPDATE users SET role = 'admin', password = $1 WHERE username = 'admin'",
        [hashedPassword]
      );
      user = await queryOne("SELECT * FROM users WHERE username = 'admin'");
    } else {
      await runQuery(
        "INSERT INTO users (username, password, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5)",
        ['admin', hashedPassword, 'admin', 'System', 'Admin']
      );
      user = await queryOne("SELECT * FROM users WHERE username = 'admin'");
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      success: true,
      message: 'Admin fixed',
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/auth/firebase-login', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token required' });
    }

    const admin = await import('firebase-admin');
    if (!admin.default.apps.length) {
      admin.default.initializeApp({
        credential: admin.default.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }

    const decoded = await admin.default.auth().verifyIdToken(idToken);
    const email = decoded.email;

    let user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);

    if (!user) {
      const hashedPassword = bcrypt.hashSync(decoded.uid, 10);
      const result = await runQuery(
        'INSERT INTO users (username, password, email, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [email?.split('@')[0] || 'user', hashedPassword, email, 'user', decoded.name?.split(' ')[0] || '', decoded.name?.split(' ')[1] || '']
      );
      user = await queryOne('SELECT * FROM users WHERE id = $1', [result.lastInsertRowid]);
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    });
  } catch (error: any) {
    console.error('Firebase login error:', error.message);
    res.status(401).json({ error: 'Firebase authentication failed' });
  }
});

router.post('/api/auth/firebase-register', async (req: Request, res: Response) => {
  try {
    const { idToken, email } = req.body;

    if (!idToken || !email) {
      return res.status(400).json({ error: 'ID token and email required' });
    }

    const admin = await import('firebase-admin');
    if (!admin.default.apps.length) {
      admin.default.initializeApp({
        credential: admin.default.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }

    const decoded = await admin.default.auth().verifyIdToken(idToken);

    let user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);

    if (user) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = bcrypt.hashSync(decoded.uid, 10);
    const result = await runQuery(
      'INSERT INTO users (username, password, email, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [email.split('@')[0], hashedPassword, email, 'user', decoded.name?.split(' ')[0] || '', decoded.name?.split(' ')[1] || '']
    );

    user = await queryOne('SELECT * FROM users WHERE id = $1', [result.lastInsertRowid]);

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    });
  } catch (error: any) {
    console.error('Firebase register error:', error.message);
    res.status(401).json({ error: 'Firebase registration failed' });
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

router.post('/api/students', authenticate, async (req: Request, res: Response) => {
  try {
    const { student_id, last_name, first_name, grade, counselor, advisory } = req.body;
    const result = await runQuery(
      'INSERT INTO students (student_id, last_name, first_name, grade, counselor, advisory) VALUES ($1, $2, $3, $4, $5, $6)',
      [student_id, last_name, first_name, grade || '9', counselor || '', advisory || '']
    );
    res.json({ id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/students/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { student_id, last_name, first_name, grade, counselor, advisory, gpa, total_points, conduct_status, observations } = req.body;
    await runQuery(
      'UPDATE students SET student_id = $1, last_name = $2, first_name = $3, grade = $4, counselor = $5, advisory = $6, gpa = $7, total_points = $8, conduct_status = $9, observations = $10 WHERE id = $11',
      [student_id || '', last_name || '', first_name || '', grade || '9', counselor || '', advisory || '', gpa || 0, total_points || 100, conduct_status || 'Good', observations || '', parseInt(req.params.id)]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/students/:id', authenticate, async (req: Request, res: Response) => {
  try {
    await runQuery('DELETE FROM students WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/api/students/bulk', authenticate, async (req: Request, res: Response) => {
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

router.post('/api/incidents', authenticate, async (req: Request, res: Response) => {
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

router.put('/api/incidents/:id', authenticate, async (req: Request, res: Response) => {
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

router.delete('/api/incidents/:id', authenticate, async (req: Request, res: Response) => {
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

router.post('/api/mtss', authenticate, async (req: Request, res: Response) => {
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

router.put('/api/mtss/:id', authenticate, async (req: Request, res: Response) => {
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

router.delete('/api/mtss/:id', authenticate, async (req: Request, res: Response) => {
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

router.put('/api/settings', authenticate, async (req: Request, res: Response) => {
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

router.put('/api/alerts/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { threshold, enabled } = req.body;
    await runQuery('UPDATE alerts SET threshold = $1, enabled = $2 WHERE id = $3', [threshold, enabled, id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api/backup', (req, res) => {
  res.json({ message: 'Database is now cloud-based with Supabase PostgreSQL. Data persists automatically!' });
});

router.post('/api/restore', (req, res) => {
  res.json({ message: 'Using cloud database - no restore needed. Data is automatically backed up!' });
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

router.post('/api/users', authenticate, async (req: Request, res: Response) => {
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
    const { id } = req.params;
    await runQuery('UPDATE users SET last_activity = CURRENT_TIMESTAMP, last_login = COALESCE(last_login, CURRENT_TIMESTAMP) WHERE id = $1', [id]);
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

router.post('/api/migrate-users', async (req: Request, res: Response) => {
  try {
    const migrations = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS classroom TEXT',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT',
    ];

    for (const sql of migrations) {
      try {
        await runQuery(sql, []);
      } catch (e) {
        console.log('Migration note:', (e as Error).message);
      }
    }

    const users = await queryAll('SELECT id, username, email, phone, classroom FROM users');
    res.json({ success: true, message: 'Migration complete', users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/debug/users', async (req: Request, res: Response) => {
  try {
    const users = await queryAll('SELECT id, username, role, email, first_name, last_name FROM users ORDER BY id');
    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Enhanced dashboard stats with date range, grade, and category filters
router.get('/api/dashboard/stats/filtered', authenticate, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, grade, category, status } = req.query;

    let dateFilter = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      dateFilter += ` AND i.date::date >= $${paramIndex}::date`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateFilter += ` AND i.date::date <= $${paramIndex}::date`;
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
      WHERE i.date >= NOW() - INTERVAL '12 weeks'
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

router.post('/api/incidents/:id/evidence', authenticate, async (req: Request, res: Response) => {
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

router.delete('/api/incidents/:id/evidence/:evidenceId', authenticate, async (req: Request, res: Response) => {
  try {
    await runQuery('DELETE FROM incident_evidence WHERE id = $1 AND incident_id = $2',
      [parseInt(req.params.evidenceId), parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ===== Escalate to Principal =====
router.put('/api/incidents/:id/escalate', authenticate, async (req: Request, res: Response) => {
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
router.post('/api/notifications/send', authenticate, async (req: Request, res: Response) => {
  try {
    const { incident_id, notification_type, recipient_email, message } = req.body;
    // This would integrate with email/WhatsApp in production
    // For now, just log and return success
    console.log(`Notification sent for incident ${incident_id}: ${notification_type} to ${recipient_email}`);
    res.json({ success: true, message: 'Notification logged (email integration pending)' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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