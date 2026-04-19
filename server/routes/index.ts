import express, { Request, Response } from 'express';
import { queryAll, queryOne, runQuery } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'discipline-tracker-secret-key';

// Middleware to check auth
const authenticate = (req: Request, res: Response, next: Function) => {
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

// Login
router.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, firstName: user.first_name, lastName: user.last_name } });
});

// Students
router.get('/api/students', authenticate, (req: Request, res: Response) => {
  const students = queryAll('SELECT * FROM students ORDER BY last_name, first_name');
  res.json(students);
});

router.get('/api/students/:id', authenticate, (req: Request, res: Response) => {
  const student = queryOne('SELECT * FROM students WHERE id = ?', [parseInt(req.params.id)]);
  res.json(student);
});

router.post('/api/students', authenticate, (req: Request, res: Response) => {
  const { student_id, last_name, first_name, grade, house_team, counselor } = req.body;
  try {
    const result = runQuery(
      'INSERT INTO students (student_id, last_name, first_name, grade, house_team, counselor) VALUES (?, ?, ?, ?, ?, ?)',
      [student_id, last_name, first_name, grade, house_team, counselor]
    );
    res.json({ id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/students/:id', authenticate, (req: Request, res: Response) => {
  const { last_name, first_name, grade, house_team, counselor, gpa, total_points, conduct_status } = req.body;
  runQuery(
    'UPDATE students SET last_name = ?, first_name = ?, grade = ?, house_team = ?, counselor = ?, gpa = ?, total_points = ?, conduct_status = ? WHERE id = ?',
    [last_name, first_name, grade, house_team, counselor, gpa, total_points, conduct_status, parseInt(req.params.id)]
  );
  res.json({ success: true });
});

router.delete('/api/students/:id', authenticate, (req: Request, res: Response) => {
  runQuery('DELETE FROM students WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// Violations
router.get('/api/violations', authenticate, (req: Request, res: Response) => {
  const violations = queryAll('SELECT * FROM violations ORDER BY category, violation_type');
  res.json(violations);
});

router.get('/api/violations/categories', authenticate, (req: Request, res: Response) => {
  const categories = queryAll('SELECT DISTINCT category FROM violations ORDER BY category');
  res.json(categories.map((c: any) => c.category));
});

router.get('/api/violations/:id', authenticate, (req: Request, res: Response) => {
  const violation = queryOne('SELECT * FROM violations WHERE id = ?', [parseInt(req.params.id)]);
  res.json(violation);
});

// Incidents
router.get('/api/incidents', authenticate, (req: Request, res: Response) => {
  const { status, studentId, category, fromDate, toDate } = req.query;
  let query = `
    SELECT i.*, s.student_id, s.last_name, s.first_name, v.violation_type, v.category, v.points_deduction as default_points
    FROM incidents i
    JOIN students s ON i.student_id = s.id
    JOIN violations v ON i.violation_id = v.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status) {
    query += ' AND i.status = ?';
    params.push(status);
  }
  if (studentId) {
    query += ' AND i.student_id = ?';
    params.push(studentId);
  }
  if (category) {
    query += ' AND v.category = ?';
    params.push(category);
  }
  if (fromDate) {
    query += ' AND i.date >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    query += ' AND i.date <= ?';
    params.push(toDate);
  }

  query += ' ORDER BY i.date DESC';

  const incidents = queryAll(query, params);
  res.json(incidents);
});

router.get('/api/incidents/:id', authenticate, (req: Request, res: Response) => {
  const incident = queryOne(`
    SELECT i.*, s.student_id, s.last_name, s.first_name, v.violation_type, v.category
    FROM incidents i
    JOIN students s ON i.student_id = s.id
    JOIN violations v ON i.violation_id = v.id
    WHERE i.id = ?
  `, [parseInt(req.params.id)]);
  res.json(incident);
});

function generateIncidentId(): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const count = queryOne('SELECT COUNT(*) as count FROM incidents WHERE incident_id LIKE ?', [`${yy}${mm}${dd}%`]);
  const seq = String((count?.count || 0) + 1).padStart(3, '0');
  return `${yy}${mm}${dd}-${seq}`;
}

router.post('/api/incidents', authenticate, (req: Request, res: Response) => {
  const { date, time, student_id, violation_id, location, description, witnesses, action_taken, consequence, notes } = req.body;
  const incidentId = generateIncidentId();

  const violation = queryOne('SELECT * FROM violations WHERE id = ?', [violation_id]);

  try {
    const result = runQuery(
      `INSERT INTO incidents (incident_id, date, time, student_id, violation_id, location, description, witnesses, action_taken, consequence, points_deducted, days_oss, administrator_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incidentId,
        date,
        time,
        student_id,
        violation_id,
        location,
        description,
        witnesses,
        action_taken,
        consequence || violation?.default_consequence,
        violation?.points_deduction || -2,
        violation?.max_oss_days || 0,
        (req as any).user.userId,
        notes
      ]
    );

    runQuery('UPDATE students SET total_points = total_points + ? WHERE id = ?',
      [violation?.points_deduction || -2, student_id]);

    res.json({ id: result.lastInsertRowid, incident_id: incidentId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/api/incidents/:id', authenticate, (req: Request, res: Response) => {
  const { status, parent_contacted, contact_date, action_taken, consequence, days_iss, days_oss, detention_hours, notes, follow_up_needed, resolved_date } = req.body;
  const id = parseInt(req.params.id);

  const fields: string[] = [];
  const values: any[] = [];

  if (status !== undefined) {
    fields.push('status = ?');
    values.push(status);
  }
  if (parent_contacted !== undefined) {
    fields.push('parent_contacted = ?');
    values.push(parent_contacted);
  }
  if (contact_date !== undefined) {
    fields.push('contact_date = ?');
    values.push(contact_date);
  }
  if (action_taken !== undefined) {
    fields.push('action_taken = ?');
    values.push(action_taken);
  }
  if (consequence !== undefined) {
    fields.push('consequence = ?');
    values.push(consequence);
  }
  if (days_iss !== undefined) {
    fields.push('days_iss = ?');
    values.push(days_iss);
  }
  if (days_oss !== undefined) {
    fields.push('days_oss = ?');
    values.push(days_oss);
  }
  if (detention_hours !== undefined) {
    fields.push('detention_hours = ?');
    values.push(detention_hours);
  }
  if (notes !== undefined) {
    fields.push('notes = ?');
    values.push(notes);
  }
  if (follow_up_needed !== undefined) {
    fields.push('follow_up_needed = ?');
    values.push(follow_up_needed);
  }
  if (resolved_date !== undefined) {
    fields.push('resolved_date = ?');
    values.push(resolved_date === null ? null : resolved_date);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  runQuery(`UPDATE incidents SET ${fields.join(', ')} WHERE id = ?`, values);

  res.json({ success: true });
});

router.delete('/api/incidents/:id', authenticate, (req: Request, res: Response) => {
  runQuery('DELETE FROM incidents WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// Dashboard Stats
router.get('/api/dashboard/stats', authenticate, (req: Request, res: Response) => {
  const total = queryOne('SELECT COUNT(*) as count FROM incidents');
  const pending = queryOne("SELECT COUNT(*) as count FROM incidents WHERE status IN ('Open', 'Pending')");
  const resolved = queryOne("SELECT COUNT(*) as count FROM incidents WHERE status = 'Resolved'");

  const byCategory = queryAll(`
    SELECT v.category, COUNT(*) as count
    FROM incidents i
    JOIN violations v ON i.violation_id = v.id
    GROUP BY v.category
  `);

  const recentIncidents = queryAll(`
    SELECT i.*, s.last_name, s.first_name, v.violation_type
    FROM incidents i
    JOIN students s ON i.student_id = s.id
    JOIN violations v ON i.violation_id = v.id
    ORDER BY i.date DESC
    LIMIT 10
  `);

  res.json({
    total: total?.count || 0,
    pending: pending?.count || 0,
    resolved: resolved?.count || 0,
    byCategory,
    recentIncidents
  });
});

// Rewards/Merits
router.post('/api/rewards', authenticate, (req: Request, res: Response) => {
  const { student_id, merit_type, points, description } = req.body;

  runQuery(
    'INSERT INTO rewards (student_id, merit_type, points, description, awarded_by) VALUES (?, ?, ?, ?, ?)',
    [student_id, merit_type, points, description, (req as any).user.userId]
  );

  runQuery('UPDATE students SET total_points = total_points + ? WHERE id = ?',
    [points, student_id]);

  res.json({ success: true });
});

router.get('/api/rewards/:studentId', authenticate, (req: Request, res: Response) => {
  const rewards = queryAll(`
    SELECT r.*, u.first_name, u.last_name
    FROM rewards r
    JOIN users u ON r.awarded_by = u.id
    WHERE r.student_id = ?
    ORDER BY r.awarded_at DESC
  `, [parseInt(req.params.studentId)]);
  res.json(rewards);
});

// MTSS Interventions
router.get('/api/mtss', authenticate, (req: Request, res: Response) => {
  const { studentId, tier } = req.query;
  let query = `
    SELECT m.*, s.last_name, s.first_name
    FROM mtss_interventions m
    JOIN students s ON m.student_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (studentId) {
    query += ' AND m.student_id = ?';
    params.push(studentId);
  }
  if (tier) {
    query += ' AND m.tier = ?';
    params.push(tier);
  }

  query += ' ORDER BY m.start_date DESC';

  const interventions = queryAll(query, params);
  res.json(interventions);
});

router.post('/api/mtss', authenticate, (req: Request, res: Response) => {
  const { student_id, tier, intervention, start_date, end_date, notes } = req.body;
  const result = runQuery(
    'INSERT INTO mtss_interventions (student_id, tier, intervention, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [student_id, tier, intervention, start_date, end_date, notes]
  );
  res.json({ id: result.lastInsertRowid });
});

router.put('/api/mtss/:id', authenticate, (req: Request, res: Response) => {
  const { tier, intervention, end_date, progress, notes } = req.body;
  runQuery(
    'UPDATE mtss_interventions SET tier = ?, intervention = ?, end_date = ?, progress = ?, notes = ? WHERE id = ?',
    [tier, intervention, end_date, progress, notes, parseInt(req.params.id)]
  );
  res.json({ success: true });
});

// Alerts
router.get('/api/alerts', authenticate, (req: Request, res: Response) => {
  const alerts = queryAll('SELECT * FROM alerts');
  res.json(alerts);
});

router.put('/api/alerts/:id', authenticate, (req: Request, res: Response) => {
  const { threshold, action, enabled } = req.body;
  runQuery('UPDATE alerts SET threshold = ?, action = ?, enabled = ? WHERE id = ?',
    [threshold, action, enabled, parseInt(req.params.id)]);
  res.json({ success: true });
});

// Settings
router.get('/api/settings', authenticate, (req: Request, res: Response) => {
  const settings = queryAll('SELECT * FROM settings');
  res.json(settings.reduce((acc: any, s: any) => { acc[s.key] = s.value; return acc; }, {}));
});

router.put('/api/settings', authenticate, (req: Request, res: Response) => {
  const settings = req.body;
  for (const [key, value] of Object.entries(settings)) {
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
  res.json({ success: true });
});

// Search students
router.get('/api/search/students', authenticate, (req: Request, res: Response) => {
  const { q } = req.query;
  const students = queryAll(`
    SELECT * FROM students
    WHERE student_id LIKE ? OR last_name LIKE ? OR first_name LIKE ?
    LIMIT 10
  `, [`%${q}%`, `%${q}%`, `%${q}%`]);
  res.json(students);
});

// AI: Suggest consequence
router.post('/api/ai/suggest-consequence', authenticate, async (req: Request, res: Response) => {
  const { violationType, category, description, previousIncidents } = req.body;
  const { suggestConsequence } = await import('../ai');
  const suggestion = await suggestConsequence(violationType, category, description, previousIncidents);
  res.json(suggestion);
});

// AI: Analyze student trends
router.get('/api/ai/analyze-student/:studentId', authenticate, async (req: Request, res: Response) => {
  const studentId = parseInt(req.params.studentId);
  const incidents = queryAll('SELECT i.*, v.violation_type, v.category FROM incidents i JOIN violations v ON i.violation_id = v.id WHERE i.student_id = ? ORDER BY i.date DESC', [studentId]);
  const { analyzeIncidentTrend } = await import('../ai');
  const analysis = await analyzeIncidentTrend(studentId, incidents);
  res.json({ incidents, analysis });
});

// AI: Generate incident report
router.get('/api/ai/generate-report/:incidentId', authenticate, async (req: Request, res: Response) => {
  const incident = queryOne(`
    SELECT i.*, s.first_name, s.last_name, s.grade, v.violation_type, v.category
    FROM incidents i
    JOIN students s ON i.student_id = s.id
    JOIN violations v ON i.violation_id = v.id
    WHERE i.id = ?
  `, [parseInt(req.params.incidentId)]);
  const { generateReport } = await import('../ai');
  const report = await generateReport(incident, incident, { violation_type: incident.violation_type, category: incident.category });
  res.json({ report });
});

export default router;