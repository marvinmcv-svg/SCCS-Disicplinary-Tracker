const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/discipline.db'));

  // Get all incidents with status
  const incidents = db.exec('SELECT id, incident_id, date, status FROM incidents ORDER BY date DESC');
  console.log('Total incidents:', incidents[0].values.length);

  // Count by status
  const byStatus = db.exec("SELECT status, COUNT(*) as cnt FROM incidents GROUP BY status");
  console.log('\nBy status:');
  if(byStatus.length > 0) {
    byStatus[0].values.forEach(s => console.log('  ' + s[0] + ': ' + s[1]));
  } else {
    console.log('  No incidents yet');
  }

  // Show all incidents
  console.log('\nAll incidents:');
  const all = db.exec('SELECT id, incident_id, date, status FROM incidents ORDER BY id DESC');
  if(all.length > 0) {
    all[0].values.forEach(i => console.log('  ID ' + i[0] + ': ' + i[1] + ' - ' + i[2] + ' [' + i[3] + ']'));
  } else {
    console.log('  No incidents found');
  }

  db.close();
}).catch(console.error);