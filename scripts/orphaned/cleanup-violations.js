const initSqlJs = require('sql.js');
const fs = require('fs');

async function cleanup() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./data/discipline.db'));

  // Check before
  let result = db.exec('SELECT COUNT(*) as count FROM violations');
  console.log('Violations before cleanup:', result[0].values[0][0]);

  // Delete all duplicates, keeping only the first (lowest id) of each type
  db.run(`
    DELETE FROM violations WHERE id NOT IN (
      SELECT MIN(id) FROM violations
      GROUP BY category, violation_type
    )
  `);

  fs.writeFileSync('./data/discipline.db', db.export());

  // Verify after
  result = db.exec('SELECT COUNT(*) as count FROM violations');
  console.log('Violations after cleanup:', result[0].values[0][0]);

  // Show remaining violations
  const violations = db.exec('SELECT id, category, violation_type FROM violations ORDER BY category, violation_type');
  console.log('\nRemaining violations:');
  violations[0].values.forEach(v => console.log(`  ${v[0]}: [${v[1]}] ${v[2]}`));

  db.close();
  console.log('\nDuplicates deleted successfully!');
}

cleanup().catch(console.error);