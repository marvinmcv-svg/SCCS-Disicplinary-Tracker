const initSqlJs = require('sql.js');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let db;
let SQL;

async function init() {
  SQL = await initSqlJs();
  const dbPath = './data/discipline.db';
  db = new SQL.Database(fs.readFileSync(dbPath));
  console.log('DB loaded');
}

function runQuery(sql, params = []) {
  console.log('SQL:', sql);
  console.log('Params:', params);
  db.run(sql, params);
  fs.writeFileSync('./data/discipline.db', db.export());
  return { lastInsertRowid: 0, changes: 0 };
}

app.put('/api/incidents/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  console.log('PUT /api/incidents/', id);
  console.log('Body:', req.body);

  try {
    runQuery('UPDATE incidents SET status = ? WHERE id = ?', [status, id]);
    console.log('Update successful');
    res.json({ success: true });
  } catch (e) {
    console.error('Error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/incidents', (req, res) => {
  const result = db.exec('SELECT * FROM incidents LIMIT 5');
  res.json({ data: result });
});

init().then(() => {
  app.listen(3002, () => {
    console.log('Test server on port 3002');
  });
});