const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/discipline.db'));

  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const datePrefix = yy + mm + dd;

  console.log('Date prefix:', datePrefix);

  const result = db.exec("SELECT COUNT(*) as count FROM incidents WHERE date LIKE '2026-04-19%'");
  console.log('Incidents today:', result[0].values[0][0]);

  const dates = db.exec('SELECT date FROM incidents LIMIT 5');
  console.log('Sample dates:', dates[0].values);

  const incidentIds = db.exec('SELECT incident_id FROM incidents LIMIT 5');
  console.log('Sample incident IDs:', incidentIds[0].values);

  db.close();
}).catch(e => console.error(e));