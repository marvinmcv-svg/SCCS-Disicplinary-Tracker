"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = express_1.default.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'discipline-tracker-secret-key';
// Middleware to check auth
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
// Login
router.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = (0, db_1.queryOne)('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcryptjs_1.default.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, firstName: user.first_name, lastName: user.last_name } });
});
// Students
router.get('/api/students', authenticate, (req, res) => {
    const students = (0, db_1.queryAll)('SELECT * FROM students ORDER BY last_name, first_name');
    res.json(students);
});
router.get('/api/students/:id', authenticate, (req, res) => {
    const student = (0, db_1.queryOne)('SELECT * FROM students WHERE id = ?', [parseInt(req.params.id)]);
    res.json(student);
});
router.post('/api/students', authenticate, (req, res) => {
    const { student_id, last_name, first_name, grade, house_team, counselor } = req.body;
    try {
        const result = (0, db_1.runQuery)('INSERT INTO students (student_id, last_name, first_name, grade, house_team, counselor) VALUES (?, ?, ?, ?, ?, ?)', [student_id, last_name, first_name, grade, house_team, counselor]);
        res.json({ id: result.lastInsertRowid });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.put('/api/students/:id', authenticate, (req, res) => {
    const { last_name, first_name, grade, house_team, counselor, gpa, total_points, conduct_status } = req.body;
    (0, db_1.runQuery)('UPDATE students SET last_name = ?, first_name = ?, grade = ?, house_team = ?, counselor = ?, gpa = ?, total_points = ?, conduct_status = ? WHERE id = ?', [last_name, first_name, grade, house_team, counselor, gpa, total_points, conduct_status, parseInt(req.params.id)]);
    res.json({ success: true });
});
router.delete('/api/students/:id', authenticate, (req, res) => {
    (0, db_1.runQuery)('DELETE FROM students WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
});
// Violations
router.get('/api/violations', authenticate, (req, res) => {
    const violations = (0, db_1.queryAll)('SELECT * FROM violations ORDER BY category, violation_type');
    res.json(violations);
});
router.get('/api/violations/categories', authenticate, (req, res) => {
    const categories = (0, db_1.queryAll)('SELECT DISTINCT category FROM violations ORDER BY category');
    res.json(categories.map((c) => c.category));
});
router.get('/api/violations/:id', authenticate, (req, res) => {
    const violation = (0, db_1.queryOne)('SELECT * FROM violations WHERE id = ?', [parseInt(req.params.id)]);
    res.json(violation);
});
// Incidents
router.get('/api/incidents', authenticate, (req, res) => {
    const { status, studentId, category, fromDate, toDate } = req.query;
    let query = `
    SELECT i.*, s.student_id, s.last_name, s.first_name, v.violation_type, v.category, v.points_deduction as default_points
    FROM incidents i
    JOIN students s ON i.student_id = s.id
    JOIN violations v ON i.violation_id = v.id
    WHERE 1=1
  `;
    const params = [];
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
    const incidents = (0, db_1.queryAll)(query, params);
    res.json(incidents);
});
router.get('/api/incidents/:id', authenticate, (req, res) => {
    const incident = (0, db_1.queryOne)(`
    SELECT i.*, s.student_id, s.last_name, s.first_name, v.violation_type, v.category
    FROM incidents i
    JOIN students s ON i.student_id = s.id
    JOIN violations v ON i.violation_id = v.id
    WHERE i.id = ?
  `, [parseInt(req.params.id)]);
    res.json(incident);
});
function generateIncidentId() {
    const date = new Date();
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const count = (0, db_1.queryOne)('SELECT COUNT(*) as count FROM incidents WHERE date LIKE ?', [`${yy}${mm}${dd}%`]);
    const seq = String((count?.count || 0) + 1).padStart(3, '0');
    return `${yy}${mm}${dd}-${seq}`;
}
router.post('/api/incidents', authenticate, (req, res) => {
    const { date, time, student_id, violation_id, location, description, witnesses, action_taken, consequence, notes } = req.body;
    const incidentId = generateIncidentId();
    const violation = (0, db_1.queryOne)('SELECT * FROM violations WHERE id = ?', [violation_id]);
    try {
        const result = (0, db_1.runQuery)(`INSERT INTO incidents (incident_id, date, time, student_id, violation_id, location, description, witnesses, action_taken, consequence, points_deducted, days_oss, administrator_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            req.user.userId,
            notes
        ]);
        (0, db_1.runQuery)('UPDATE students SET total_points = total_points + ? WHERE id = ?', [violation?.points_deduction || -2, student_id]);
        res.json({ id: result.lastInsertRowid, incident_id: incidentId });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.put('/api/incidents/:id', authenticate, (req, res) => {
    const { status, parent_contacted, contact_date, action_taken, consequence, days_iss, days_oss, detention_hours, notes, follow_up_needed, resolved_date } = req.body;
    (0, db_1.runQuery)(`
    UPDATE incidents SET
      status = COALESCE(?, status),
      parent_contacted = COALESCE(?, parent_contacted),
      contact_date = COALESCE(?, contact_date),
      action_taken = COALESCE(?, action_taken),
      consequence = COALESCE(?, consequence),
      days_iss = COALESCE(?, days_iss),
      days_oss = COALESCE(?, days_oss),
      detention_hours = COALESCE(?, detention_hours),
      notes = COALESCE(?, notes),
      follow_up_needed = COALESCE(?, follow_up_needed),
      resolved_date = COALESCE(?, resolved_date)
    WHERE id = ?
  `, [status, parent_contacted, contact_date, action_taken, consequence, days_iss, days_oss, detention_hours, notes, follow_up_needed, resolved_date, parseInt(req.params.id)]);
    res.json({ success: true });
});
router.delete('/api/incidents/:id', authenticate, (req, res) => {
    (0, db_1.runQuery)('DELETE FROM incidents WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
});
// Dashboard Stats
router.get('/api/dashboard/stats', authenticate, (req, res) => {
    const total = (0, db_1.queryOne)('SELECT COUNT(*) as count FROM incidents');
    const pending = (0, db_1.queryOne)("SELECT COUNT(*) as count FROM incidents WHERE status IN ('Open', 'Pending')");
    const resolved = (0, db_1.queryOne)("SELECT COUNT(*) as count FROM incidents WHERE status = 'Resolved'");
    const byCategory = (0, db_1.queryAll)(`
    SELECT v.category, COUNT(*) as count
    FROM incidents i
    JOIN violations v ON i.violation_id = v.id
    GROUP BY v.category
  `);
    const recentIncidents = (0, db_1.queryAll)(`
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
router.post('/api/rewards', authenticate, (req, res) => {
    const { student_id, merit_type, points, description } = req.body;
    (0, db_1.runQuery)('INSERT INTO rewards (student_id, merit_type, points, description, awarded_by) VALUES (?, ?, ?, ?, ?)', [student_id, merit_type, points, description, req.user.userId]);
    (0, db_1.runQuery)('UPDATE students SET total_points = total_points + ? WHERE id = ?', [points, student_id]);
    res.json({ success: true });
});
router.get('/api/rewards/:studentId', authenticate, (req, res) => {
    const rewards = (0, db_1.queryAll)(`
    SELECT r.*, u.first_name, u.last_name
    FROM rewards r
    JOIN users u ON r.awarded_by = u.id
    WHERE r.student_id = ?
    ORDER BY r.awarded_at DESC
  `, [parseInt(req.params.studentId)]);
    res.json(rewards);
});
// MTSS Interventions
router.get('/api/mtss', authenticate, (req, res) => {
    const { studentId, tier } = req.query;
    let query = `
    SELECT m.*, s.last_name, s.first_name
    FROM mtss_interventions m
    JOIN students s ON m.student_id = s.id
    WHERE 1=1
  `;
    const params = [];
    if (studentId) {
        query += ' AND m.student_id = ?';
        params.push(studentId);
    }
    if (tier) {
        query += ' AND m.tier = ?';
        params.push(tier);
    }
    query += ' ORDER BY m.start_date DESC';
    const interventions = (0, db_1.queryAll)(query, params);
    res.json(interventions);
});
router.post('/api/mtss', authenticate, (req, res) => {
    const { student_id, tier, intervention, start_date, end_date, notes } = req.body;
    const result = (0, db_1.runQuery)('INSERT INTO mtss_interventions (student_id, tier, intervention, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?)', [student_id, tier, intervention, start_date, end_date, notes]);
    res.json({ id: result.lastInsertRowid });
});
router.put('/api/mtss/:id', authenticate, (req, res) => {
    const { tier, intervention, end_date, progress, notes } = req.body;
    (0, db_1.runQuery)('UPDATE mtss_interventions SET tier = ?, intervention = ?, end_date = ?, progress = ?, notes = ? WHERE id = ?', [tier, intervention, end_date, progress, notes, parseInt(req.params.id)]);
    res.json({ success: true });
});
// Alerts
router.get('/api/alerts', authenticate, (req, res) => {
    const alerts = (0, db_1.queryAll)('SELECT * FROM alerts');
    res.json(alerts);
});
router.put('/api/alerts/:id', authenticate, (req, res) => {
    const { threshold, action, enabled } = req.body;
    (0, db_1.runQuery)('UPDATE alerts SET threshold = ?, action = ?, enabled = ? WHERE id = ?', [threshold, action, enabled, parseInt(req.params.id)]);
    res.json({ success: true });
});
// Settings
router.get('/api/settings', authenticate, (req, res) => {
    const settings = (0, db_1.queryAll)('SELECT * FROM settings');
    res.json(settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {}));
});
router.put('/api/settings', authenticate, (req, res) => {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
        (0, db_1.runQuery)('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
    res.json({ success: true });
});
// Search students
router.get('/api/search/students', authenticate, (req, res) => {
    const { q } = req.query;
    const students = (0, db_1.queryAll)(`
    SELECT * FROM students
    WHERE student_id LIKE ? OR last_name LIKE ? OR first_name LIKE ?
    LIMIT 10
  `, [`%${q}%`, `%${q}%`, `%${q}%`]);
    res.json(students);
});
// AI: Suggest consequence
router.post('/api/ai/suggest-consequence', authenticate, async (req, res) => {
    const { violationType, category, description, previousIncidents } = req.body;
    const { suggestConsequence } = await Promise.resolve().then(() => __importStar(require('../ai')));
    const suggestion = await suggestConsequence(violationType, category, description, previousIncidents);
    res.json(suggestion);
});
// AI: Analyze student trends
router.get('/api/ai/analyze-student/:studentId', authenticate, async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    const incidents = (0, db_1.queryAll)('SELECT i.*, v.violation_type, v.category FROM incidents i JOIN violations v ON i.violation_id = v.id WHERE i.student_id = ? ORDER BY i.date DESC', [studentId]);
    const { analyzeIncidentTrend } = await Promise.resolve().then(() => __importStar(require('../ai')));
    const analysis = await analyzeIncidentTrend(studentId, incidents);
    res.json({ incidents, analysis });
});
// AI: Generate incident report
router.get('/api/ai/generate-report/:incidentId', authenticate, async (req, res) => {
    const incident = (0, db_1.queryOne)(`
    SELECT i.*, s.first_name, s.last_name, s.grade, v.violation_type, v.category
    FROM incidents i
    JOIN students s ON i.student_id = s.id
    JOIN violations v ON i.violation_id = v.id
    WHERE i.id = ?
  `, [parseInt(req.params.incidentId)]);
    const { generateReport } = await Promise.resolve().then(() => __importStar(require('../ai')));
    const report = await generateReport(incident, incident, { violation_type: incident.violation_type, category: incident.category });
    res.json({ report });
});
exports.default = router;
