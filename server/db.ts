import { Pool } from 'pg';

// DB Row Types
export interface UserRow { id: number; username: string; password: string; role: string; first_name: string; last_name: string; email: string | null; phone: string | null; classroom: string | null; profile_picture: string | null; created_at: Date; department: string | null; advisory: string | null; is_active: boolean; last_login: Date | null; two_factor_enabled: boolean; last_activity: Date | null; }
export interface UserActivityLogRow { id: number; user_id: number; action: string; details: string | null; created_at: Date; }
export interface StudentRow { id: number; student_id: string; last_name: string; first_name: string; grade: number; house_team: string | null; counselor: string | null; gpa: number; total_points: number; conduct_status: string; observations: string; created_at: Date; }
export interface ViolationRow { id: number; category: string; violation_type: string; description: string | null; points_deduction: number; default_consequence: string | null; min_oss_days: number; max_oss_days: number; severity: string; mandatory_parent_contact: boolean; mandatory_admin_review: boolean; progressive_consequences: any; }
export interface IncidentRow { id: number; incident_id: string; date: string; time: string | null; student_id: number; violation_id: number; location: string | null; description: string | null; witnesses: string | null; parent_contacted: string; contact_date: string | null; action_taken: string | null; consequence: string | null; points_deducted: number; days_iss: number; days_oss: number; detention_hours: number; referral_date: string | null; administrator_id: number | null; notes: string | null; follow_up_needed: string; follow_up_date: string | null; status: string; resolved_date: string | null; evidence: string | null; created_at: Date; reported_by: string | null; escalated_to_principal: boolean; principal_notified_at: string | null; }
export interface MTSSRow { id: number; student_id: number; tier: number; intervention: string; start_date: string; end_date: string | null; progress: string; notes: string | null; created_at: Date; intervention_goal: string | null; progress_monitoring: string | null; review_date: string | null; exit_criteria: string | null; incident_link: number | null; advisor: string | null; tier_history: any; }
export interface SettingRow { key: string; value: string; }
export interface AlertRow { id: number; alert_type: string; threshold: number; action: string | null; enabled: string; }

interface QueryResult { rows: any[]; rowCount: number | null; }

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const isLocalConnection = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new Pool({
  connectionString,
  ssl: isLocalConnection ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  statement_timeout: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const result = await pool.query(sql, params);
    return result.rows as T[];
  } catch (error: any) {
    console.error('Query error:', error.message);
    throw error;
  }
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  try {
    const result = await pool.query(sql, params);
    return (result.rows[0] as T) || null;
  } catch (error: any) {
    console.error('Query error:', error.message);
    throw error;
  }
}

export async function runQuery(sql: string, params: any[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
  try {
    const result = await pool.query(sql, params) as QueryResult;
    return {
      lastInsertRowid: result.rows[0]?.id || 0,
      changes: result.rowCount || 0
    };
  } catch (error: any) {
    console.error('Query error:', error.message);
    throw error;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected:', result.rows[0].now);
    return true;
  } catch (error: any) {
    console.error('Database connection test failed:', error.message);
    return false;
  }
}

export async function initializeDatabase() {
  console.log('Initializing PostgreSQL database...');
  const maskedConn = connectionString!.replace(/:[^:@]+@/, ':****@');
  console.log('Connection:', maskedConn);

  try {
    await testConnection();
  } catch (e: any) {
    console.log('Connection test failed, will retry with queries:', e.message);
  }

  const tableQueries = [
    { name: 'users', sql: `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', first_name TEXT, last_name TEXT, email TEXT, classroom TEXT, phone TEXT, profile_picture TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, department TEXT, advisory TEXT, is_active BOOLEAN DEFAULT TRUE, last_login TIMESTAMP, two_factor_enabled BOOLEAN DEFAULT FALSE, last_activity TIMESTAMP)` },
    { name: 'students', sql: `CREATE TABLE IF NOT EXISTS students (id SERIAL PRIMARY KEY, student_id TEXT UNIQUE NOT NULL, last_name TEXT NOT NULL, first_name TEXT NOT NULL, grade INTEGER DEFAULT 9, section TEXT, house_team TEXT, counselor TEXT, advisory TEXT, gpa REAL DEFAULT 0.0, total_points INTEGER DEFAULT 100, conduct_status TEXT DEFAULT 'Good', observations TEXT DEFAULT '', date_of_birth TEXT, parent_name TEXT, parent_phone TEXT, parent_email TEXT, gender TEXT, profile_picture TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'violations', sql: `CREATE TABLE IF NOT EXISTS violations (id SERIAL PRIMARY KEY, category TEXT NOT NULL, violation_type TEXT NOT NULL, description TEXT, points_deduction INTEGER DEFAULT -2, default_consequence TEXT, min_oss_days INTEGER DEFAULT 0, max_oss_days INTEGER DEFAULT 1, severity TEXT DEFAULT 'Medium', mandatory_parent_contact BOOLEAN DEFAULT FALSE, mandatory_admin_review BOOLEAN DEFAULT FALSE, progressive_consequences JSONB DEFAULT '[]'::jsonb)` },
    { name: 'incidents', sql: `CREATE TABLE IF NOT EXISTS incidents (id SERIAL PRIMARY KEY, incident_id TEXT UNIQUE NOT NULL, date TEXT NOT NULL, time TEXT, student_id INTEGER NOT NULL, violation_id INTEGER NOT NULL, location TEXT, description TEXT, witnesses TEXT, parent_contacted TEXT DEFAULT 'No', contact_date TEXT, action_taken TEXT, consequence TEXT, points_deducted INTEGER DEFAULT -2, days_iss INTEGER DEFAULT 0, days_oss INTEGER DEFAULT 0, detention_hours REAL DEFAULT 0, referral_date TEXT, administrator_id INTEGER, notes TEXT, follow_up_needed TEXT DEFAULT 'No', follow_up_date TEXT, status TEXT DEFAULT 'Open', resolved_date TEXT, evidence TEXT, reported_by TEXT, escalated_to_principal BOOLEAN DEFAULT FALSE, principal_notified_at TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'parent_contacts', sql: `CREATE TABLE IF NOT EXISTS parent_contacts (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL, contact_date TEXT NOT NULL, contact_method TEXT, parent_name TEXT, notes TEXT, follow_up_required TEXT DEFAULT 'No')` },
    { name: 'mtss_interventions', sql: `CREATE TABLE IF NOT EXISTS mtss_interventions (id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL, tier INTEGER NOT NULL, intervention TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, progress TEXT DEFAULT 'Not Started', notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, intervention_goal TEXT, progress_monitoring TEXT, review_date TEXT, exit_criteria TEXT, incident_link INTEGER REFERENCES incidents(id), advisor TEXT, tier_history JSONB DEFAULT '[]'::jsonb)` },
    { name: 'alerts', sql: `CREATE TABLE IF NOT EXISTS alerts (id SERIAL PRIMARY KEY, alert_type TEXT NOT NULL, threshold INTEGER DEFAULT 3, action TEXT, enabled TEXT DEFAULT 'Yes')` },
    { name: 'settings', sql: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)` },
    { name: 'incident_status_logs', sql: `CREATE TABLE IF NOT EXISTS incident_status_logs (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL, changed_by INTEGER NOT NULL, previous_status TEXT, new_status TEXT NOT NULL, changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notes TEXT)` },
    { name: 'incident_evidence', sql: `CREATE TABLE IF NOT EXISTS incident_evidence (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL, file_name TEXT NOT NULL, file_url TEXT, file_type TEXT, uploaded_by INTEGER NOT NULL, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'user_activity_log', sql: `CREATE TABLE IF NOT EXISTS user_activity_log (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, action TEXT NOT NULL, details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'password_reset_tokens', sql: `CREATE TABLE IF NOT EXISTS password_reset_tokens (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    // ---- Master-prompt compliance tables ----
    // 1.2 sessions: server-side session registry enabling logout revocation
    // (all tabs), the 30-minute inactivity timeout and absolute expiry.
    { name: 'sessions', sql: `CREATE TABLE IF NOT EXISTS sessions (jti TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP NOT NULL, revoked_at TIMESTAMP, revoked_reason TEXT, ip TEXT, user_agent TEXT)` },
    // 4.3 password_history: rolling last-5 hashes to block reuse.
    { name: 'password_history', sql: `CREATE TABLE IF NOT EXISTS password_history (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, password_hash TEXT NOT NULL, changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    // 2.1 audit_logs: immutable who/what/when/ip trail (UPDATE/DELETE blocked
    // by trigger below).
    { name: 'audit_logs', sql: `CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, user_id INTEGER, username TEXT, role TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, entity_label TEXT, changes JSONB DEFAULT '[]'::jsonb, ip TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    // 6.2 security_events: suspicious activity monitoring (lockouts, denied
    // access, rate limiting, NTSS failures).
    { name: 'security_events', sql: `CREATE TABLE IF NOT EXISTS security_events (id SERIAL PRIMARY KEY, event_type TEXT NOT NULL, severity TEXT DEFAULT 'info', user_id INTEGER, username TEXT, details JSONB DEFAULT '{}'::jsonb, ip TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    // 2.4 correction_requests: staff request changes, principal/admin approves.
    { name: 'correction_requests', sql: `CREATE TABLE IF NOT EXISTS correction_requests (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, requested_by INTEGER NOT NULL REFERENCES users(id), requested_changes JSONB NOT NULL, reason TEXT, status TEXT DEFAULT 'Pending', requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, reviewed_by INTEGER, reviewed_at TIMESTAMP, review_notes TEXT, applied_at TIMESTAMP)` },
    // 3.2 NTSS submission log + per-record outcomes.
    { name: 'ntss_submissions', sql: `CREATE TABLE IF NOT EXISTS ntss_submissions (id SERIAL PRIMARY KEY, batch_id TEXT UNIQUE NOT NULL, submitted_by INTEGER NOT NULL REFERENCES users(id), record_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Queued', fail_mode TEXT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP, response_summary JSONB DEFAULT '{}'::jsonb, retry_count INTEGER DEFAULT 0)` },
    { name: 'ntss_submission_items', sql: `CREATE TABLE IF NOT EXISTS ntss_submission_items (id SERIAL PRIMARY KEY, submission_id INTEGER NOT NULL REFERENCES ntss_submissions(id) ON DELETE CASCADE, incident_id INTEGER NOT NULL REFERENCES incidents(id), ntss_record JSONB, status TEXT NOT NULL DEFAULT 'Queued', error_message TEXT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    // 1.3 parent_student_links: verified links decide what a parent (or a
    // student, for their own record) can see.
    { name: 'parent_student_links', sql: `CREATE TABLE IF NOT EXISTS parent_student_links (id SERIAL PRIMARY KEY, parent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, verified BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (parent_user_id, student_id))` },
  ];

  for (const table of tableQueries) {
    try {
      await pool.query(table.sql);
      console.log(`✓ ${table.name} table ready`);
    } catch (error: any) {
      console.error(`✗ ${table.name} table error:`, error.message);
    }
  }

  await migrateUsersTable();
  await migrateIncidentsTable();
  await migrateStudentsTable();
  await migrateComplianceColumns();
  await createAuditImmutabilityTrigger();
  await createIndexes();
  await createForeignKeys();

  try {
    await seedViolations();
    await seedAlerts();
    await seedDefaultSettings();
    await createDefaultAdmin();
    await seedTestAccounts();
    await seedAdvisorAccounts();
    await reconcileParentLinks();
    console.log('Database initialization complete!');
  } catch (error: any) {
    console.error('Seeding error:', error.message);
  }
}

/**
 * Master-prompt compliance migrations: lockout/audit/NTSS columns plus
 * indexes for the new tables.
 */
async function migrateComplianceColumns() {
  const columns = [
    // 4.3 account lockout state.
    { name: 'users.failed_login_attempts', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0' },
    { name: 'users.locked_until', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP' },
    // 5.1 terms-of-service acknowledgment timestamp.
    { name: 'users.terms_accepted_at', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP' },
    { name: 'users.password_changed_at', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    // 3.2 NTSS readiness + submission marker on each incident.
    { name: 'incidents.ntss_ready', sql: 'ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ntss_ready BOOLEAN DEFAULT FALSE' },
    { name: 'incidents.ntss_submitted_at', sql: 'ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ntss_submitted_at TIMESTAMP' },
  ];
  for (const col of columns) {
    try {
      await pool.query(col.sql);
      console.log(`✓ ${col.name} ready`);
    } catch (e: any) {
      if (!e.message.includes('already exists')) console.error(`  ${col.name}:`, e.message);
    }
  }

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_correction_requests_status ON correction_requests(status)',
    'CREATE INDEX IF NOT EXISTS idx_ntss_items_submission ON ntss_submission_items(submission_id)',
    'CREATE INDEX IF NOT EXISTS idx_ntss_items_incident ON ntss_submission_items(incident_id)',
    'CREATE INDEX IF NOT EXISTS idx_parent_links_parent ON parent_student_links(parent_user_id, verified)',
    'CREATE INDEX IF NOT EXISTS idx_parent_links_student ON parent_student_links(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id, changed_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_ntss ON incidents(ntss_submitted_at)',
  ];
  for (const sql of indexes) {
    try { await pool.query(sql); } catch (e: any) { console.error('Index error:', e.message); }
  }
  console.log('✓ compliance indexes ready');
}

/**
 * 2.1: the audit trail is immutable at the DATABASE level — UPDATE and DELETE
 * raise an exception for every role. Archiving is an offline DBA procedure
 * (pg_dump the rows, then drop the partition) documented in the admin guide.
 */
async function createAuditImmutabilityTrigger() {
  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs are immutable: % is not permitted (archive via the documented offline procedure)', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs`);
    await pool.query(`
      CREATE TRIGGER audit_logs_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
    `);
    console.log('✓ audit_logs immutability trigger ready');
  } catch (error: any) {
    console.error('audit immutability trigger error:', error.message);
  }
}

/**
 * 1.1 test accounts for every role (master prompt: "Create test accounts for
 * each role"). Idempotent — only creates what is missing. Disable with
 * SCCS_SEED_TEST_ACCOUNTS=false.
 *
 * The counselor/teacher accounts are linked to REAL demo data so scoping is
 * observable: the counselor's name matches students.counselor on ~dozens of
 * seeded students, the teacher's advisory matches a homeroom.
 */
async function seedTestAccounts() {
  if (process.env.SCCS_SEED_TEST_ACCOUNTS === 'false') return;

  const bcrypt = await import('bcryptjs');
  const accounts: Array<{ username: string; password: string; role: string; first: string; last: string; advisory?: string }> = [
    { username: 'principal', password: 'Principal!2026', role: 'principal', first: 'Patricia', last: 'Principal' },
    { username: 'staff', password: 'Staff!2026', role: 'staff', first: 'Sam', last: 'Staffer' },
    { username: 'parent', password: 'Parent!2026', role: 'parent', first: ' Paula', last: 'Parent' },
    { username: 'parent2', password: 'Parent2!2026', role: 'parent', first: 'Peter', last: 'Parenttwo' },
    { username: 'pendingparent', password: 'Pending!2026', role: 'parent', first: 'Penny', last: 'Pendingparent' },
    { username: 'student', password: 'Student!2026', role: 'student', first: 'Stu', last: 'Dent' },
  ];

  // Counselor account: match the most common counselor value in the roster so
  // the scoping filter has data to show.
  try {
    const top = await pool.query(
      `SELECT counselor, COUNT(*) AS c FROM students WHERE counselor IS NOT NULL AND counselor != '' GROUP BY counselor ORDER BY c DESC LIMIT 1`
    );
    if (top.rows.length > 0) {
      const value = String(top.rows[0].counselor).trim();
      const idx = value.lastIndexOf(' ');
      const first = idx > 0 ? value.slice(0, idx) : value;
      const last = idx > 0 ? value.slice(idx + 1) : '(counselor)';
      accounts.unshift({ username: 'counselor', password: 'Counselor!2026', role: 'counselor', first, last });
    }
  } catch { /* roster empty — skip the counselor account */ }

  // Teacher account: match a real advisory (homeroom) so classroom scoping has
  // data to show.
  try {
    const top = await pool.query(
      `SELECT advisory, COUNT(*) AS c FROM students WHERE advisory IS NOT NULL AND advisory != '' GROUP BY advisory ORDER BY c DESC LIMIT 1`
    );
    if (top.rows.length > 0) {
      accounts.unshift({ username: 'teacher', password: 'Teacher!2026', role: 'teacher', first: 'Taylor', last: 'Teacher', advisory: String(top.rows[0].advisory).trim() });
    }
  } catch { /* roster empty — skip the teacher account */ }

  for (const a of accounts) {
    try {
      const exists = await pool.query('SELECT id FROM users WHERE username = $1', [a.username]);
      if (exists.rows.length > 0) continue;
      const hash = bcrypt.hashSync(a.password, 10);
      const res = await pool.query(
        `INSERT INTO users (username, password, role, first_name, last_name, advisory, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
        [a.username, hash, a.role, a.first.trim(), a.last, (a as any).advisory ?? null]
      );
      const userId = res.rows[0].id;
      await pool.query('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [userId, hash]);
      console.log(`✓ test account '${a.username}' (${a.role}) ready`);
    } catch (e: any) {
      console.error(`test account ${a.username}:`, e.message);
    }
  }

  await linkParentTestAccounts();
  await linkStudentTestAccount();
}

/**
 * 1.3: link the parent test accounts to real students.
 *   parent  → verified link to a student with a parent email on file
 *   parent2 → verified link to a DIFFERENT student (cross-access testing)
 *   pendingparent → UNVERIFIED link (must receive no access)
 */
async function linkParentTestAccounts() {
  const bcrypt = await import('bcryptjs');
  try {
    const studentsWithEmail = await pool.query(
      `SELECT id, parent_email FROM students WHERE parent_email IS NOT NULL AND parent_email != '' ORDER BY id ASC LIMIT 2`
    );
    if (studentsWithEmail.rows.length < 2) return;

    // Give parent/parent2 the matching emails so reconcileParentLinks()
    // creates VERIFIED links automatically (email verification model).
    const assignments = [
      { username: 'parent', email: studentsWithEmail.rows[0].parent_email },
      { username: 'parent2', email: studentsWithEmail.rows[1].parent_email },
    ];
    for (const a of assignments) {
      await pool.query('UPDATE users SET email = $1 WHERE username = $2 AND (email IS NULL OR email = \'\')', [a.email, a.username]);
    }

    // pendingparent: unverified link to a third student — no access until an
    // admin verifies it (PUT /api/parent/links/:id/verify).
    const third = await pool.query(
      `SELECT id FROM students WHERE id NOT IN ($1, $2) ORDER BY id ASC LIMIT 1`,
      [studentsWithEmail.rows[0].id, studentsWithEmail.rows[1].id]
    );
    if (third.rows.length > 0) {
      const pendingUser = await pool.query(`SELECT id FROM users WHERE username = 'pendingparent'`);
      if (pendingUser.rows.length > 0) {
        await pool.query(
          `INSERT INTO parent_student_links (parent_user_id, student_id, verified) VALUES ($1, $2, FALSE)
           ON CONFLICT (parent_user_id, student_id) DO NOTHING`,
          [pendingUser.rows[0].id, third.rows[0].id]
        );
      }
    }
    void bcrypt;
  } catch (e: any) {
    console.error('parent test links:', e.message);
  }
}

/**
 * 1.2 One login account (role: 'teacher') for every advisor on the app's
 * hardcoded staff list (allAdvisors in client/src/pages/Students.tsx and
 * MTSS.tsx — 'Mr Adachi', 'Ms Tello', …). Each account is scoped to the
 * advisor's most-populated homeroom (users.advisory = 'Rm N - <name>') so
 * teacher role scoping shows their own advisory students. Idempotent —
 * existing usernames are never touched. Disable with
 * SCCS_SEED_ADVISOR_ACCOUNTS=false.
 */
const ADVISOR_STAFF = [
  'Mr Adachi', 'Mr Cohello', 'MrDiPascuale', 'Mr Kane', 'Mr Ortiz', 'Ms Aguirre',
  'Ms Camacho', 'Ms Fernandez', 'Ms Guaristi', 'Ms Hopp', 'Ms Meneses', 'Ms Molina',
  'Ms Palacios', 'Ms Rios', 'Ms Robinson', 'Ms Skelly', 'Ms Tello', 'Ms Tomelic',
  'Ms Zuazo', 'Mr Coronado', 'Mr Herbert', 'Mr Kreller', 'Mr Odekerken', 'Mr Soliz',
] as const;

async function seedAdvisorAccounts(): Promise<void> {
  if (process.env.SCCS_SEED_ADVISOR_ACCOUNTS === 'false') return;

  const bcrypt = await import('bcryptjs');
  const password = process.env.ADVISOR_ACCOUNT_PASSWORD || 'Teacher!2026';
  const hash = bcrypt.hashSync(password, 10);

  for (const name of ADVISOR_STAFF) {
    try {
      // 'Ms Tello' → username 'MsTello' ('MrDiPascuale' stays as-is, no space).
      const username = name.replace(/\s+/g, '');
      // Split honorific from surname: 'Ms Tello' → first 'Ms', last 'Tello';
      // 'MrDiPascuale' → first 'Mr', last 'DiPascuale'.
      const m = /^(Mr|Ms|Mrs|Dr)\s*(.+)$/.exec(name);
      const first = m ? m[1] : name;
      const last = m ? m[2] : '';

      const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (exists.rows.length > 0) continue;

      // Scope the teacher to their most-populated advisory room, if any.
      let advisory: string | null = null;
      const room = await pool.query(
        `SELECT advisory FROM students
         WHERE advisory IS NOT NULL AND advisory != '' AND advisory LIKE '%' || $1 || '%'
         GROUP BY advisory ORDER BY COUNT(*) DESC LIMIT 1`,
        [name]
      );
      if (room.rows.length > 0) advisory = String(room.rows[0].advisory).trim();

      const res = await pool.query(
        `INSERT INTO users (username, password, role, first_name, last_name, advisory, is_active)
         VALUES ($1, $2, 'teacher', $3, $4, $5, TRUE) RETURNING id`,
        [username, hash, first, last, advisory]
      );
      const userId = res.rows[0].id;
      await pool.query('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [userId, hash]);
      console.log(`✓ advisor account '${username}' (teacher) ready${advisory ? ` — advisory: ${advisory}` : ''}`);
    } catch (e: any) {
      console.error(`advisor account ${name}:`, e.message);
    }
  }
}

/** Link the student test account to its own record (verified by definition). */
async function linkStudentTestAccount() {
  try {
    const studentUser = await pool.query(`SELECT id FROM users WHERE username = 'student' AND role = 'student'`);
    if (studentUser.rows.length === 0) return;
    const someStudent = await pool.query(`SELECT id FROM students ORDER BY id ASC LIMIT 1`);
    if (someStudent.rows.length === 0) return;
    await pool.query(
      `INSERT INTO parent_student_links (parent_user_id, student_id, verified) VALUES ($1, $2, TRUE)
       ON CONFLICT (parent_user_id, student_id) DO NOTHING`,
      [studentUser.rows[0].id, someStudent.rows[0].id]
    );
  } catch (e: any) {
    console.error('student test link:', e.message);
  }
}

/**
 * 1.3: a parent's email must be linked to the student record before access is
 * granted. Reconcile at boot: any parent-role user whose email matches a
 * student's parent_email gets a VERIFIED link (idempotent).
 */
async function reconcileParentLinks() {
  try {
    const res = await pool.query(`
      INSERT INTO parent_student_links (parent_user_id, student_id, verified)
      SELECT u.id, s.id, TRUE
      FROM users u
      JOIN students s ON LOWER(TRIM(s.parent_email)) = LOWER(TRIM(u.email))
      WHERE u.role = 'parent' AND u.email IS NOT NULL AND u.email != ''
      ON CONFLICT (parent_user_id, student_id) DO UPDATE SET verified = TRUE
    `);
    if (res.rowCount && res.rowCount > 0) {
      console.log(`✓ verified ${res.rowCount} parent↔student email link(s)`);
    }
  } catch (e: any) {
    console.error('parent link reconcile:', e.message);
  }
}

async function seedViolations() {
  const existing = await pool.query('SELECT COUNT(*) FROM violations');
  if (parseInt(existing.rows[0].count) > 0) return;

  // violations: [category, violation_type, description, points, consequence, min_oss, max_oss, severity, mandatory_parent, mandatory_admin, progressive_consequences]
  const violations = [
    // Attendance - Low severity
    ["Attendance", "Tardy to School", "Arriving late to school without proper excuse", -2, "Warning", 0, 0, "Low", false, false, [["1st", "Warning"], ["3rd", "Detention"], ["5th", "Saturday School"]]],
    ["Attendance", "Tardy to Class", "Arriving late to class without a pass", -2, "Warning", 0, 0, "Low", false, false, [["1st", "Warning"], ["3rd", "Detention"]]],
    ["Attendance", "Unexcused Absence", "Missing school without parent notification", -3, "Detention", 0, 1, "Medium", true, false, [["1st", "Detention"], ["2nd", "Saturday School"], ["3rd", "ISS"]]],
    ["Attendance", "Class Cut/AWOL", "Skipping class or leaving school", -5, "Saturday School", 0, 2, "Medium", true, false, [["1st", "Saturday School"], ["2nd", "ISS"], ["3rd", "OSS"]]],
    // Classroom Behavior - varies
    ["Classroom Behavior", "Classroom Disruption", "Behavior that interrupts learning", -2, "Warning", 0, 0, "Low", false, false, [["1st", "Warning"], ["2nd", "Detention"], ["3rd", "ISS"]]],
    ["Classroom Behavior", "Insubordination", "Refusing to comply with staff requests", -3, "Detention", 0, 1, "Medium", false, false, [["1st", "Detention"], ["2nd", "ISS"], ["3rd", "OSS"]]],
    ["Classroom Behavior", "Defiant Behavior", "Openly defying authority", -3, "ISS", 0, 3, "High", true, true, [["1st", "ISS"], ["2nd", "OSS"]]],
    ["Classroom Behavior", "Inappropriate Language", "Using profanity or vulgar language", -2, "Warning", 0, 0, "Low", false, false, [["1st", "Warning"], ["2nd", "Detention"]]],
    // Physical Behavior - High severity
    ["Physical Behavior", "Physical Altercation", "Getting into physical confrontation", -5, "OSS", 1, 3, "High", true, true, [["1st", "OSS"], ["2nd", "Extended OSS"]]],
    ["Physical Behavior", "Fighting", "Engaging in physical combat", -10, "OSS", 3, 10, "Critical", true, true, [["1st", "OSS"], ["2nd", "Expulsion Referral"]]],
    // Academic Integrity
    ["Academic Integrity", "Cheating", "Academic dishonesty on tests/assignments", -5, "Zero", 0, 1, "Medium", true, false, [["1st", "Zero"], ["2nd", "ISS"]]],
    ["Academic Integrity", "Plagiarism", "Using work without proper citation", -5, "Zero", 0, 0, "Medium", true, false, [["1st", "Zero"], ["2nd", "ISS"]]],
    // Dress Code - Low
    ["Dress Code", "Dress Code Violation", "Not adhering to school dress code", -2, "Warning", 0, 0, "Low", false, false, [["1st", "Warning"], ["2nd", "Parent Contact"]]],
    // Tobacco/Alcohol/Drugs - High
    ["Tobacco/Alcohol/Drugs", "Tobacco Possession", "Possessing tobacco on campus", -5, "3-Day OSS", 3, 3, "High", true, true, [["1st", "3-Day OSS"], ["2nd", "5-Day OSS"]]],
    ["Tobacco/Alcohol/Drugs", "Vaping", "Using e-cigarettes on campus", -5, "3-Day OSS", 3, 3, "High", true, true, [["1st", "3-Day OSS"], ["2nd", "5-Day OSS"]]],
    // Bullying/Harassment - High/Critical
    ["Bullying/Harassment", "Bullying", "Intimidating or harassing behavior", -5, "OSS", 3, 5, "High", true, true, [["1st", "OSS"], ["2nd", "Extended OSS"]]],
    ["Bullying/Harassment", "Threats", "Threatening to harm others", -10, "OSS", 5, 10, "Critical", true, true, [["1st", "OSS"], ["2nd", "Expulsion Referral"]]],
    // Weapons - Critical
    ["Weapons", "Weapons Possession", "Possessing weapons on campus", -25, "Expulsion", 99, 99, "Critical", true, true, [["1st", "Expulsion"]]],
    // Property
    ["Property", "Theft", "Stealing property", -10, "OSS", 0, 5, "High", true, true, [["1st", "OSS"], ["2nd", "Legal Referral"]]],
    ["Property", "Vandalism", "Deliberately damaging property", -10, "OSS", 0, 5, "High", true, true, [["1st", "OSS"], ["2nd", "Restitution"]]],
    // Technology - Low
    ["Technology", "AUP Violation", "Violating technology use policy", -2, "Warning", 0, 0, "Low", false, false, [["1st", "Warning"], ["2nd", "Suspension of Tech Privileges"]]],
    // Safety - High
    ["Safety", "Fire Alarm Misuse", "Pulling fire alarm without cause", -5, "OSS", 1, 3, "High", true, true, [["1st", "OSS"], ["2nd", "Legal Referral"]]],
  ];

  for (const v of violations) {
    await pool.query(
      `INSERT INTO violations (category, violation_type, description, points_deduction, default_consequence, min_oss_days, max_oss_days, severity, mandatory_parent_contact, mandatory_admin_review, progressive_consequences)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`,
      [...v.slice(0, 10), JSON.stringify(v[10])]
    );
  }
}

async function seedAlerts() {
  const existing = await pool.query('SELECT COUNT(*) FROM alerts');
  if (parseInt(existing.rows[0].count) > 0) return;

  const alerts = [
    ["Repeat Offender", 3, "Auto-flag when student has 3+ incidents in 30 days", "Yes"],
    ["Chronic Absences", 5, "Referral when student has 5+ unexcused absences", "Yes"],
    ["OSS Limit", 10, "Admin review required when OSS reaches 10 days", "Yes"],
  ];

  for (const a of alerts) {
    await pool.query(
      `INSERT INTO alerts (alert_type, threshold, action, enabled) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      a
    );
  }
}

async function seedDefaultSettings() {
  const settings = [
    ["school_name", "SCCS"],
    ["academic_year", "2025-2026"],
    ["max_points", "100"],
    ["passing_threshold", "60"],
  ];

  for (const s of settings) {
    await pool.query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, s);
  }
}

/**
 * Referential integrity between the tables.
 *
 * Every relationship was a bare `INTEGER NOT NULL` with no constraint, so
 * deleting a student left their entire incident history pointing at an id that
 * no longer existed — invisible orphans in a disciplinary record.
 *
 * Two policies, chosen per relationship:
 *
 *   RESTRICT — for records that stand on their own. You should not be able to
 *   delete a student who has incidents, or a violation type that incidents
 *   cite. The API turns the resulting error into a clear message.
 *
 *   CASCADE — for rows that only exist as part of a parent: evidence files,
 *   status log entries and parent-contact notes belong to one incident and are
 *   meaningless without it.
 *
 * Adding a constraint fails if the table already violates it, so each is
 * preceded by an orphan check. When orphans exist the constraint is skipped and
 * the count reported, rather than crashing the boot — an app that will not start
 * is worse than one missing a constraint, and the operator needs to see the
 * problem to fix it.
 */
async function createForeignKeys() {
  const constraints = [
    {
      name: 'fk_incidents_student',
      table: 'incidents',
      column: 'student_id',
      references: 'students(id)',
      onDelete: 'RESTRICT',
    },
    {
      name: 'fk_incidents_violation',
      table: 'incidents',
      column: 'violation_id',
      references: 'violations(id)',
      onDelete: 'RESTRICT',
    },
    {
      name: 'fk_mtss_student',
      table: 'mtss_interventions',
      column: 'student_id',
      references: 'students(id)',
      onDelete: 'RESTRICT',
    },
    {
      name: 'fk_evidence_incident',
      table: 'incident_evidence',
      column: 'incident_id',
      references: 'incidents(id)',
      onDelete: 'CASCADE',
    },
    {
      name: 'fk_status_logs_incident',
      table: 'incident_status_logs',
      column: 'incident_id',
      references: 'incidents(id)',
      onDelete: 'CASCADE',
    },
    {
      name: 'fk_parent_contacts_incident',
      table: 'parent_contacts',
      column: 'incident_id',
      references: 'incidents(id)',
      onDelete: 'CASCADE',
    },
    {
      name: 'fk_reset_tokens_user',
      table: 'password_reset_tokens',
      column: 'user_id',
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
  ];

  let added = 0;
  let skipped = 0;

  for (const c of constraints) {
    try {
      const exists = await pool.query(
        `SELECT 1 FROM pg_constraint WHERE conname = $1`,
        [c.name]
      );
      if (exists.rows.length > 0) continue;

      const referencedTable = c.references.split('(')[0];
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM ${c.table} child
         WHERE child.${c.column} IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM ${referencedTable} parent WHERE parent.id = child.${c.column})`
      );
      const orphans = rows[0]?.count ?? 0;

      if (orphans > 0) {
        console.warn(
          `⚠ ${c.table}.${c.column}: ${orphans} row(s) reference a missing ${referencedTable} record. ` +
          `Constraint ${c.name} not applied — clean up these rows and restart to enforce it.`
        );
        skipped++;
        continue;
      }

      await pool.query(
        `ALTER TABLE ${c.table} ADD CONSTRAINT ${c.name}
         FOREIGN KEY (${c.column}) REFERENCES ${c.references} ON DELETE ${c.onDelete}`
      );
      added++;
    } catch (error: any) {
      console.error(`Foreign key ${c.name} error:`, error.message);
      skipped++;
    }
  }

  console.log(
    `✓ foreign keys ready (${added} added this run, ${skipped} skipped, ` +
    `${constraints.length - added - skipped} already present)`
  );
}

/**
 * Indexes for the columns the app actually filters and joins on.
 *
 * Every table had only its primary key, so the dashboard's aggregations and the
 * per-student incident history did sequential scans. That is unnoticeable on a
 * fresh database and steadily worse across a school year as incidents pile up.
 *
 * CONCURRENTLY is deliberately not used: it cannot run inside the implicit
 * transaction here, and these tables are small enough that the brief lock at
 * startup is not worth the added complexity.
 */
async function createIndexes() {
  const indexes = [
    // Incident lookups: by student (profile view), by date (dashboard ranges),
    // by status (open-incident counts), by violation (category breakdowns).
    'CREATE INDEX IF NOT EXISTS idx_incidents_student_id ON incidents(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(date)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_violation_id ON incidents(violation_id)',
    // Roster filtering by grade and section.
    'CREATE INDEX IF NOT EXISTS idx_students_grade_section ON students(grade, section)',
    // MTSS and evidence are always fetched for one student or one incident.
    'CREATE INDEX IF NOT EXISTS idx_mtss_student_id ON mtss_interventions(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_incident_evidence_incident_id ON incident_evidence(incident_id)',
    'CREATE INDEX IF NOT EXISTS idx_incident_status_logs_incident_id ON incident_status_logs(incident_id)',
    'CREATE INDEX IF NOT EXISTS idx_parent_contacts_incident_id ON parent_contacts(incident_id)',
    // Activity log is read per user and ordered by recency.
    'CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id, created_at DESC)',
    // Password reset looks tokens up directly; the column is already UNIQUE, so
    // this only covers the expiry sweep.
    'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)',
  ];

  for (const sql of indexes) {
    try {
      await pool.query(sql);
    } catch (error: any) {
      console.error('Index error:', error.message);
    }
  }
  console.log(`✓ ${indexes.length} indexes ready`);
}

/**
 * Creates the first administrator account from environment variables, once.
 *
 * Deliberately create-only: an earlier version reset a hardcoded admin password
 * on every boot, which silently reverted any password change made through the
 * UI. If the account already exists this does nothing — recover a lost password
 * through the reset flow, not by redeploying.
 */
async function createDefaultAdmin() {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!username || !password) {
    const { rows } = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (rows.length === 0) {
      console.warn(
        '⚠ No admin account exists and INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD are unset. ' +
        'Set both and restart to create the first administrator.'
      );
    }
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    return;
  }

  const bcrypt = await import('bcryptjs');
  await pool.query(
    `INSERT INTO users (username, password, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
    [
      username,
      bcrypt.hashSync(password, 10),
      'admin',
      process.env.INITIAL_ADMIN_FIRST_NAME || 'System',
      process.env.INITIAL_ADMIN_LAST_NAME || 'Administrator',
    ]
  );
  console.log(`✓ Initial administrator '${username}' created`);
}

async function migrateUsersTable() {
  const columns = [
    { name: 'email', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT' },
    { name: 'phone', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT' },
    { name: 'classroom', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS classroom TEXT' },
    { name: 'profile_picture', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT' },
    { name: 'department', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT' },
    { name: 'advisory', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS advisory TEXT' },
    { name: 'is_active', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE' },
    { name: 'last_login', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP' },
    { name: 'two_factor_enabled', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE' },
    { name: 'last_activity', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP' },
  ];

  for (const col of columns) {
    try {
      await pool.query(col.sql);
      console.log(`✓ users column ${col.name} ready`);
    } catch (e) {
      if ((e as Error).message.includes('already exists')) {
        console.log(`  users column ${col.name} already exists`);
      } else {
        console.log(`  users column ${col.name}:`, (e as Error).message);
      }
    }
  }
}

async function migrateIncidentsTable() {
  const columns = [
    { name: 'reported_by', sql: 'ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reported_by TEXT' },
    { name: 'advisor', sql: 'ALTER TABLE incidents ADD COLUMN IF NOT EXISTS advisor TEXT' },
  ];

  for (const col of columns) {
    try {
      await pool.query(col.sql);
      console.log(`✓ incidents column ${col.name} ready`);
    } catch (e) {
      if ((e as Error).message.includes('already exists')) {
        console.log(`  incidents column ${col.name} already exists`);
      } else {
        console.log(`  incidents column ${col.name}:`, (e as Error).message);
      }
    }
  }
}

async function migrateStudentsTable() {
  const columns = [
    { name: 'section', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS section TEXT' },
    { name: 'house_team', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS house_team TEXT' },
    { name: 'advisory', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS advisory TEXT' },
    { name: 'date_of_birth', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth TEXT' },
    { name: 'parent_name', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT' },
    { name: 'parent_phone', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT' },
    { name: 'parent_email', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email TEXT' },
    { name: 'gender', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT' },
    { name: 'profile_picture', sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_picture TEXT' },
  ];

  for (const col of columns) {
    try {
      await pool.query(col.sql);
      console.log(`✓ students column ${col.name} ready`);
    } catch (e) {
      if ((e as Error).message.includes('already exists')) {
        console.log(`  students column ${col.name} already exists`);
      } else {
        console.log(`  students column ${col.name}:`, (e as Error).message);
      }
    }
  }
}

export default pool;