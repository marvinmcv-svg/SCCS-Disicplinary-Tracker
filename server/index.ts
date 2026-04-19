import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './db';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 3001;

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use(routes);

app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     DISCIPLINE TRACKER SERVER RUNNING             ║
║     Port: ${PORT}                                ║
║     API:  http://localhost:${PORT}/api              ║
║     Default Admin: admin / admin123              ║
╚══════════════════════════════════════════════════════════╝
    `);
  });
}

startServer();

export default app;