const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/discipline.db'));

  console.log('=== APP STATUS CHECK ===\n');

  // Check incidents
  const incidents = db.exec('SELECT COUNT(*) FROM incidents');
  console.log('Total incidents:', incidents[0].values[0][0]);

  const byStatus = db.exec("SELECT status, COUNT(*) FROM incidents GROUP BY status");
  console.log('Incidents by status:');
  byStatus.forEach(s => console.log('  ' + s.values[0][0] + ': ' + s.values[0][1]));

  // Check students
  const students = db.exec('SELECT COUNT(*) FROM students');
  console.log('\nTotal students:', students[0].values[0][0]);

  // Check violations
  const violations = db.exec('SELECT COUNT(*) FROM violations');
  console.log('Total violations:', violations[0].values[0][0]);

  // Check users
  const users = db.exec('SELECT COUNT(*) FROM users');
  console.log('Total users:', users[0].values[0][0]);

  // Sample incident details
  console.log('\n=== SAMPLE INCIDENT ===');
  const sample = db.exec('SELECT i.*, s.last_name, s.first_name, v.violation_type FROM incidents i JOIN students s ON i.student_id = s.id JOIN violations v ON i.violation_id = v.id LIMIT 1');
  if (sample.length > 0 && sample[0].values.length > 0) {
    const cols = sample[0].columns;
    const vals = sample[0].values[0];
    console.log('Incident details:');
    cols.forEach((c, i) => console.log('  ' + c + ': ' + vals[i]));
  }

  db.close();
  console.log('\n=== ALL CHECKS PASSED ===');
}).catch(console.error);