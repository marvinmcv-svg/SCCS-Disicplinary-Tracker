const initSqlJs = require('sql.js');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let db;

async function initDB() {
  const SQL = await initSqlJs();
  const dbPath = './data/discipline.db';
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  console.log('DB loaded');
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results.length > 0 ? results[0] : null;
}

function runQuery(sql, params = []) {
  db.run(sql, params);
  fs.writeFileSync('./data/discipline.db', db.export());
  const lastId = queryOne('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: lastId?.id || 0, changes: 0 };
}

function generateIncidentId() {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const count = queryOne('SELECT COUNT(*) as count FROM incidents WHERE date LIKE ?', [`${yy}${mm}${dd}%`]);
  const seq = String((count?.count || 0) + 1).padStart(3, '0');
  return `${yy}${mm}${dd}-${seq}`;
}

app.post('/api/incidents', (req, res) => {
  console.log('Request body:', req.body);

  const { date, time, student_id, violation_id, location, description, witnesses, action_taken, consequence, notes } = req.body;
  const incidentId = generateIncidentId();

  console.log('Generated incident ID:', incidentId);

  const violation = queryOne('SELECT * FROM violations WHERE id = ?', [violation_id]);
  console.log('Violation lookup result:', violation);

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
        1,
        notes
      ]
    );

    console.log('Insert result:', result);

    res.json({ id: result.lastInsertRowid, incident_id: incidentId });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

initDB().then(() => {
  app.listen(3001, () => {
    console.log('Test server running on port 3001');
  });
});