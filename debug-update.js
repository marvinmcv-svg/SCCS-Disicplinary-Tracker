const initSqlJs = require('sql.js');
const fs = require('fs');

async function test() {
  const SQL = await initSqlJs();
  const dbPath = './data/discipline.db';
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  }

  // Test COALESCE behavior with undefined/null
  const testTable = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='incidents'");
  console.log('Table exists:', testTable.length > 0);

  // Get an incident to test with
  const incident = db.exec('SELECT id, status, resolved_date FROM incidents LIMIT 1');
  console.log('Sample incident:', incident[0]?.values);

  // Test what happens with COALESCE when value is null vs undefined
  const testVal = db.exec("SELECT COALESCE(NULL, 'existing') as result");
  console.log('COALESCE with NULL:', testVal[0]?.values[0]);

  db.close();
}

test().catch(console.error);