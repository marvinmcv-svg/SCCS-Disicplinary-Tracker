const initSqlJs = require('sql.js');
const fs = require('fs');

async function test() {
  const SQL = await initSqlJs();
  const dbPath = './data/discipline.db';
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  }

  // Check ALL incidents
  const allIncidents = db.exec('SELECT incident_id, date, student_id, violation_id FROM incidents ORDER BY date DESC LIMIT 10');
  console.log('All incidents (last 10):', allIncidents[0]?.values || []);

  // Check if there are any incidents with ID containing 260419
  const midApril = db.exec("SELECT incident_id, date FROM incidents WHERE incident_id LIKE '%260419%' OR incident_id LIKE '%260418%'");
  console.log('Mid-April incidents:', midApril[0]?.values || []);

  db.close();
}

test().catch(console.error);