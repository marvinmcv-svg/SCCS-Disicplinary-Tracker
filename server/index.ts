import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeDatabase, testConnection } from './db';
import routes from './routes';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

/** Whether initializeDatabase() completed. Reported by /api/health. */
let databaseReady = false;

app.use(routes);

/**
 * Health check.
 *
 * Returns 503 — not 200 — when the database is unreachable, so an uptime monitor
 * actually fires. A paused Supabase project took this app down for five days
 * while the platform reported the deployment as healthy, because the process was
 * up and holding the port. A health endpoint that answers 200 while every query
 * fails is worse than no health endpoint: it makes the outage look like uptime.
 */
app.get('/api/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
    databaseInitialized: databaseReady,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/version', (req, res) => {
  res.json({
    version: process.env.APP_VERSION || '1.0.0',
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    minAppVersion: process.env.MIN_APP_VERSION || '1.0.0'
  });
});

if (process.env.NODE_ENV === 'production') {
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
  console.log('Starting server...');

  try {
    await initializeDatabase();
    databaseReady = true;
    console.log('Database initialization complete');
  } catch (error) {
    // Deliberately still starts: a database that is briefly unreachable at boot
    // should not leave the service permanently down, and the pool recovers on
    // its own. What must not happen is the previous behaviour — logging the
    // same "complete" line as the success path and reporting healthy anyway.
    databaseReady = false;
    console.error('DATABASE INITIALIZATION FAILED — the app cannot serve data.', error);
    console.error('Starting anyway so /api/health can report the failure; it will answer 503 until the database recovers.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();

export default app;