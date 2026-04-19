const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/discipline.db'));

  // Check incidents and their violation references
  const incidents = db.exec('SELECT id, incident_id, violation_id FROM incidents');
  console.log('Incidents and their violation_ids:');
  incidents[0].values.forEach(i => console.log('  ID ' + i[0] + ' (' + i[1] + '): violation_id = ' + i[2]));

  // Check if violation_id 65 exists
  const v65 = db.exec('SELECT id FROM violations WHERE id = 65');
  console.log('\nviolation_id 65 exists:', v65.length > 0 && v65[0].values.length > 0);

  // Get a valid violation_id for 'Cheating'
  const cheating = db.exec("SELECT id FROM violations WHERE violation_type = 'Cheating'");
  if(cheating.length > 0) console.log('\nValid Cheating violation ID:', cheating[0].values[0][0]);

  // Get all valid violation IDs
  const allViolations = db.exec('SELECT id, violation_type FROM violations ORDER BY id');
  console.log('\nAll valid violations:');
  allViolations[0].values.forEach(v => console.log('  ID ' + v[0] + ': ' + v[1]));

  db.close();
}).catch(console.error);