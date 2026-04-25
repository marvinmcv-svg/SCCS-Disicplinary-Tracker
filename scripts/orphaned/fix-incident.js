const initSqlJs = require('sql.js');
const fs = require('fs');

async function test() {
  const SQL = await initSqlJs();
  const dbPath = './data/discipline.db';
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  }

  // Simulate generateIncidentId logic
  const yy = '26';
  const mm = '04';
  const dd = '19';
  const datePrefix = yy + mm + dd;

  console.log('Looking for incidents with date like:', datePrefix + '%');

  // The buggy query uses date column
  const byDate = db.exec("SELECT COUNT(*) as count FROM incidents WHERE date LIKE '" + datePrefix + "%'");
  console.log('Count using date column:', byDate[0].values[0][0]);

  // The correct query should use incident_id column
  const byId = db.exec("SELECT COUNT(*) as count FROM incidents WHERE incident_id LIKE '" + datePrefix + "%'");
  console.log('Count using incident_id column:', byId[0].values[0][0]);

  db.close();
}

test().catch(console.error);