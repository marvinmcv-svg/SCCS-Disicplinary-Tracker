import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './db';
import routes from './routes';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

const dataDir = isProduction 
  ? path.join(process.cwd(), 'data')
  : path.join(__dirname, '../data');
  
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

// Backup endpoint - download database
app.get('/api/backup', (req, res) => {
  const dbPath = path.join(dataDir, 'discipline.db');
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, 'discipline.db');
  } else {
    res.status(404).json({ error: 'Database not found' });
  }
});

// Restore endpoint - upload database
const upload = multer({ dest: dataDir });
app.post('/api/restore', upload.single('database'), (req: any, res: any) => {
  const uploadedPath = req.file?.path;
  const dbPath = path.join(dataDir, 'discipline.db');
  
  if (uploadedPath && fs.existsSync(uploadedPath)) {
    // Remove old db and rename uploaded
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    fs.renameSync(uploadedPath, dbPath);
    res.json({ success: true, message: 'Database restored successfully' });
  } else {
    res.status(400).json({ error: 'No database file uploaded' });
  }
});

if (isProduction) {
  app.use(express.static(path.join(process.cwd(), 'client/dist')));
  
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(process.cwd(), 'client/dist/index.html'));
    }
  });
}

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

export default app;