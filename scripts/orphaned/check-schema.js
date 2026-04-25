const initSqlJs = require('sql.js');
const fs = require('fs');
const http = require('http');

async function test() {
  const SQL = await initSqlJs();
  const dbPath = './data/discipline.db';
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  }

  // Check incidents with date '2026-04-19'
  const existing = db.exec("SELECT incident_id, date FROM incidents WHERE date = '2026-04-19'");
  console.log('Existing incidents on 2026-04-19:', existing[0]?.values || []);

  // Check violations to get a valid violation_id
  const violations = db.exec('SELECT id, violation_type FROM violations LIMIT 3');
  console.log('Available violations:', violations[0]?.values || []);

  // Check students
  const students = db.exec('SELECT id, last_name, first_name FROM students LIMIT 3');
  console.log('Available students:', students[0]?.values || []);

  db.close();
}

test().catch(console.error);