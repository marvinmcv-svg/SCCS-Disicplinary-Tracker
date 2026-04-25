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

router.get('/api/incidents', authenticate, async (req: Request, res: Response) => {
  try {
    const incidents = await queryAll(`
      SELECT i.*, s.last_name, s.first_name, s.student_id as student_id_raw, 
             v.violation_type, v.category
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      JOIN violations v ON i.violation_id = v.id
      ORDER BY i.date DESC, i.id DESC
    `);
    res.json(incidents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/incidents/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const incident = await queryOne(`
      SELECT i.*, s.last_name, s.first_name, s.student_id as student_id_raw,
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
    const { date, time, student_id, violation_id, location, description, witnesses, advisor, action_taken, consequence, notes } = req.body;

    const datePrefix = date.replace(/-/g, '').slice(2);
    const count = await queryOne('SELECT COUNT(*) as count FROM incidents WHERE incident_id LIKE $1', [`${datePrefix}%`]);
    const incidentId = `${datePrefix}-${String((count?.count || 0) + 1).padStart(3, '0')}`;

    const violation = await queryOne('SELECT * FROM violations WHERE id = $1', [violation_id]);

    await runQuery(
      `INSERT INTO incidents (incident_id, date, time, student_id, violation_id, location, description, witnesses, advisor, action_taken, consequence, points_deducted, days_oss, administrator_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        incidentId,
        date,
        time,
        student_id,
        violation_id,
        location,
        description,
        witnesses,
        advisor,
        action_taken,
        consequence || violation?.default_consequence,
        violation?.points_deduction || -2,
        violation?.max_oss_days || 0,
        req.user!.userId,
        notes
      ]
    );
    res.json({ id: incidentId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/incidents/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, parent_contacted, contact_date, action_taken, consequence, days_iss, days_oss, detention_hours, notes, follow_up_needed, resolved_date, advisor } = req.body;
    const id = parseInt(req.params.id);

    const updates: string[] = [];
    const values: any[] = [];

    if (status !== undefined) { updates.push('status = $' + (values.length + 1)); values.push(status); }
    if (parent_contacted !== undefined) { updates.push('parent_contacted = $' + (values.length + 1)); values.push(parent_contacted); }
    if (contact_date !== undefined) { updates.push('contact_date = $' + (values.length + 1)); values.push(contact_date); }
    if (action_taken !== undefined) { updates.push('action_taken = $' + (values.length + 1)); values.push(action_taken); }
    if (consequence !== undefined) { updates.push('consequence = $' + (values.length + 1)); values.push(consequence); }
    if (days_iss !== undefined) { updates.push('days_iss = $' + (values.length + 1)); values.push(days_iss); }
    if (days_oss !== undefined) { updates.push('days_oss = $' + (values.length + 1)); values.push(days_oss); }
    if (detention_hours !== undefined) { updates.push('detention_hours = $' + (values.length + 1)); values.push(detention_hours); }
    if (notes !== undefined) { updates.push('notes = $' + (values.length + 1)); values.push(notes); }
    if (follow_up_needed !== undefined) { updates.push('follow_up_needed = $' + (values.length + 1)); values.push(follow_up_needed); }
    if (resolved_date !== undefined) { updates.push('resolved_date = $' + (values.length + 1)); values.push(resolved_date === null ? null : resolved_date); }
    if (advisor !== undefined) { updates.push('advisor = $' + (values.length + 1)); values.push(advisor); }

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
    const interventions = await queryAll(`
      SELECT m.*, s.last_name, s.first_name
      FROM mtss_interventions m
      JOIN students s ON m.student_id = s.id
      ORDER BY m.start_date DESC
    `);
    res.json(interventions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/mtss', authenticate, async (req: Request, res: Response) => {
  try {
    const { student_id, tier, intervention, advisor, start_date, end_date, progress, notes } = req.body;
    const result = await runQuery(
      'INSERT INTO mtss_interventions (student_id, tier, intervention, advisor, start_date, end_date, progress, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [student_id, tier, intervention, advisor, start_date, end_date, progress || 'Not Started', notes]
    );
    res.json({ id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/mtss/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { student_id, tier, intervention, advisor, start_date, end_date, progress, notes } = req.body;
    const id = parseInt(req.params.id);
    await runQuery(
      'UPDATE mtss_interventions SET student_id = $1, tier = $2, intervention = $3, advisor = $4, start_date = $5, end_date = $6, progress = $7, notes = $8 WHERE id = $9',
      [student_id, tier, intervention, advisor || '', start_date, end_date || null, progress || 'Not Started', notes || '', id]
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
    const users = await queryAll('SELECT id, username, role, first_name, last_name, email, phone, classroom, profile_picture, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/users/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await queryOne('SELECT id, username, role, first_name, last_name, email, phone, classroom, profile_picture, created_at FROM users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/users', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { username, password, role, first_name, last_name, email, phone, classroom } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    await runQuery(
      'INSERT INTO users (username, password, role, first_name, last_name, email, phone, classroom) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [username, hashedPassword, role || 'user', first_name || '', last_name || '', email || '', phone || '', classroom || '']
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
    const { username, role, first_name, last_name, email, phone, classroom, profile_picture, newPassword } = req.body;

    console.log(`PUT /api/users/${id} - user: ${currentUser.userId}, role: ${currentUser.role}`);
    console.log('Payload:', { username, role, first_name, last_name, email, phone, classroom, profile_picture: profile_picture ? '(base64 length: ' + profile_picture.length + ')' : 'empty', newPassword: newPassword ? '(set)' : 'not set' });

    // Allow if admin OR if editing own profile
    if (currentUser.role !== 'admin' && currentUser.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'You can only edit your own profile' });
    }

    // Non-admins cannot change roles
    if (currentUser.role !== 'admin' && role !== currentUser.role) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    // Check for duplicate username
    const existingUser = await queryOne('SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists. Please choose a different one.' });
    }

    if (newPassword) {
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      const result = await pool.query(
        'UPDATE users SET username = $1, role = $2, first_name = $3, last_name = $4, email = $5, phone = $6, classroom = $7, profile_picture = $8, password = $9 WHERE id = $10 RETURNING *',
        [username, role, first_name || '', last_name || '', email || '', phone || '', classroom || '', profile_picture || '', hashedPassword, id]
      );
      console.log('Update result (with password):', result.rowCount, 'rows affected');
    } else {
      const result = await pool.query(
        'UPDATE users SET username = $1, role = $2, first_name = $3, last_name = $4, email = $5, phone = $6, classroom = $7, profile_picture = $8 WHERE id = $9 RETURNING *',
        [username, role, first_name || '', last_name || '', email || '', phone || '', classroom || '', profile_picture || '', id]
      );
      console.log('Update result:', result.rowCount, 'rows affected');
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Update error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/users/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    if (user.userId === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await runQuery('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
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
    const hashedPassword = bcrypt.hashSync(password, 10);
    await runQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, id]);
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