const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/discipline.db'));

  // Try to create an incident directly
  const incidentId = '260419-TEST';

  // Get a valid student and violation
  const student = db.exec('SELECT id FROM students LIMIT 1');
  const violation = db.exec('SELECT id, points_deduction, default_consequence, max_oss_days FROM violations LIMIT 1');

  const studentId = student[0].values[0][0];
  const violationId = violation[0].values[0][0];
  const points = violation[0].values[0][1];
  const consequence = violation[0].values[0][2];
  const maxOss = violation[0].values[0][3];

  console.log('Testing insert with:');
  console.log('  student_id:', studentId);
  console.log('  violation_id:', violationId);
  console.log('  points:', points);
  console.log('  consequence:', consequence);

  try {
    db.run(`
      INSERT INTO incidents (incident_id, date, student_id, violation_id, location, description, points_deducted, consequence, days_oss, administrator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [incidentId, '2026-04-19', studentId, violationId, 'Classroom', 'Test incident', points, consequence, maxOss, 1]);

    fs.writeFileSync('./data/discipline.db', db.export());

    // Verify
    const result = db.exec("SELECT incident_id, date, status FROM incidents WHERE incident_id = '260419-TEST'");
    console.log('\nInsert result:', result[0].values[0]);

    // Clean up test data
    db.run("DELETE FROM incidents WHERE incident_id = '260419-TEST'");
    fs.writeFileSync('./data/discipline.db', db.export());
    console.log('Test incident deleted.');

    console.log('\n✅ INSERT WORKS - No database issues');
  } catch (error) {
    console.log('\n❌ INSERT FAILED:', error.message);
  }

  db.close();
}).catch(console.error);