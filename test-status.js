const initSqlJs = require('sql.js');
const fs = require('fs');

async function test() {
  const SQL = await initSqlJs();
  const dbPath = './data/discipline.db';
  let db = new SQL.Database(fs.readFileSync(dbPath));

  console.log('=== Testing Status Updates ===\n');

  // Get all incidents with their IDs and statuses
  const incidents = db.exec('SELECT id, incident_id, status, resolved_date FROM incidents');
  console.log('All incidents:', incidents[0]?.values);

  // Test update on ID 2 (from the test data we saw earlier)
  const testId = 2;
  console.log('\nTesting update on incident ID:', testId);

  // First check current state
  const before = db.exec('SELECT id, status, resolved_date FROM incidents WHERE id = ?', [testId]);
  console.log('Before update:', before[0]?.values);

  // Do update
  db.run('UPDATE incidents SET status = ?, resolved_date = ? WHERE id = ?',
    ['Pending', '2026-04-19', testId]);
  fs.writeFileSync(dbPath, db.export());

  // Check after
  const after = db.exec('SELECT id, status, resolved_date FROM incidents WHERE id = ?', [testId]);
  console.log('After update:', after[0]?.values);

  // Reset
  db.run('UPDATE incidents SET status = ?, resolved_date = ? WHERE id = ?',
    ['Open', null, testId]);
  fs.writeFileSync(dbPath, db.export());

  console.log('\nReset complete');

  db.close();
}

test().catch(console.error);