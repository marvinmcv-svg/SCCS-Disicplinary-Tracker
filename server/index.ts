import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { initializeDatabase, testConnection } from './db';
import routes from './routes';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Railway terminates TLS upstream, so the client IP arrives in X-Forwarded-For.
// Without this the rate limiter sees every request as coming from the proxy and
// would throttle all users as one.
app.set('trust proxy', 1);

app.use(
  helmet({
    // The SPA is served from this same origin; default-src 'self' with inline
    // styles is what the Vite build actually needs.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline'. The service worker is therefore registered from
        // main.tsx rather than an inline <script> in index.html, which CSP
        // would block.
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // blob: covers the PDF and spreadsheet exports; data: covers the
        // base64 profile pictures stored on student records.
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // Stated explicitly so PWA installation does not depend on how a given
        // browser falls back to default-src for these.
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
    },
    // Set explicitly rather than relying on the default, since this app holds
    // student records and should never be framed or sniffed.
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'same-origin' },
  })
);

/**
 * Allowed browser origins.
 *
 * The web app is served from the same origin as the API, so it needs no CORS
 * grant at all. This list exists for the Capacitor Android build, whose webview
 * has its own origin. Configure ALLOWED_ORIGINS as a comma-separated list.
 *
 * Previously this was a bare `cors()`, which reflects any origin — so any
 * website a signed-in staff member visited could call this API with their
 * session.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and non-browser clients (curl, the mobile shell) send no Origin.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

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