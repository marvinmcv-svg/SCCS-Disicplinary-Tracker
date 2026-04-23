import express, { Request, Response } from 'express';
import { queryAll, queryOne, runQuery } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'discipline-tracker-secret-key';

const authenticate = async (req: Request, res: Response, next: Function) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
    (req as any).user = decoded;
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
    const { last_name, first_name, grade, counselor, advisory, gpa, total_points, conduct_status, observations } = req.body;
    await runQuery(
      'UPDATE students SET last_name = $1, first_name = $2, grade = $3, counselor = $4, advisory = $5, gpa = $6, total_points = $7, conduct_status = $8, observations = $9 WHERE id = $10',
      [last_name, first_name, grade, counselor, advisory || '', gpa, total_points, conduct_status, observations || '', parseInt(req.params.id)]
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
    res.json(categories.map((c: any) => c.category));
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
        (req as any).user.userId,
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

router.get('/api/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const settings = await queryAll('SELECT * FROM settings');
    const settingsObj: any = {};
    settings.forEach((s: any) => { settingsObj[s.key] = s.value; });
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
    const user = (req as any).user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const users = await queryAll('SELECT id, username, role, first_name, last_name, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/users', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { username, password, role, first_name, last_name } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    await runQuery(
      'INSERT INTO users (username, password, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5)',
      [username, hashedPassword, role || 'user', first_name || '', last_name || '']
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/users/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    const { username, role, first_name, last_name } = req.body;
    await runQuery(
      'UPDATE users SET username = COALESCE($1, username), role = COALESCE($2, role), first_name = COALESCE($3, first_name), last_name = COALESCE($4, last_name) WHERE id = $5',
      [username, role, first_name, last_name, id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/api/users/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
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
    const user = (req as any).user;
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