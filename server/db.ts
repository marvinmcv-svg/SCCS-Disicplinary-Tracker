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

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.cpdrclazmvboenhlsccf:Gmc190494mcv@aws-1-us-west-2.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
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
  console.log('Connection:', connectionString.replace(/:[^:@]+@/, ':****@'));

  try {
    await testConnection();
  } catch (e: any) {
    console.log('Connection test failed, will retry with queries:', e.message);
  }

  const tableQueries = [
    { name: 'users', sql: `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', first_name TEXT, last_name TEXT, email TEXT, classroom TEXT, phone TEXT, profile_picture TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, department TEXT, advisory TEXT, is_active BOOLEAN DEFAULT TRUE, last_login TIMESTAMP, two_factor_enabled BOOLEAN DEFAULT FALSE, last_activity TIMESTAMP)` },
    { name: 'students', sql: `CREATE TABLE IF NOT EXISTS students (id SERIAL PRIMARY KEY, student_id TEXT UNIQUE NOT NULL, last_name TEXT NOT NULL, first_name TEXT NOT NULL, grade INTEGER DEFAULT 9, house_team TEXT, counselor TEXT, gpa REAL DEFAULT 0.0, total_points INTEGER DEFAULT 100, conduct_status TEXT DEFAULT 'Good', observations TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'violations', sql: `CREATE TABLE IF NOT EXISTS violations (id SERIAL PRIMARY KEY, category TEXT NOT NULL, violation_type TEXT NOT NULL, description TEXT, points_deduction INTEGER DEFAULT -2, default_consequence TEXT, min_oss_days INTEGER DEFAULT 0, max_oss_days INTEGER DEFAULT 1, severity TEXT DEFAULT 'Medium', mandatory_parent_contact BOOLEAN DEFAULT FALSE, mandatory_admin_review BOOLEAN DEFAULT FALSE, progressive_consequences JSONB DEFAULT '[]'::jsonb)` },
    { name: 'incidents', sql: `CREATE TABLE IF NOT EXISTS incidents (id SERIAL PRIMARY KEY, incident_id TEXT UNIQUE NOT NULL, date TEXT NOT NULL, time TEXT, student_id INTEGER NOT NULL, violation_id INTEGER NOT NULL, location TEXT, description TEXT, witnesses TEXT, parent_contacted TEXT DEFAULT 'No', contact_date TEXT, action_taken TEXT, consequence TEXT, points_deducted INTEGER DEFAULT -2, days_iss INTEGER DEFAULT 0, days_oss INTEGER DEFAULT 0, detention_hours REAL DEFAULT 0, referral_date TEXT, administrator_id INTEGER, notes TEXT, follow_up_needed TEXT DEFAULT 'No', follow_up_date TEXT, status TEXT DEFAULT 'Open', resolved_date TEXT, evidence TEXT, reported_by TEXT, escalated_to_principal BOOLEAN DEFAULT FALSE, principal_notified_at TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'parent_contacts', sql: `CREATE TABLE IF NOT EXISTS parent_contacts (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL, contact_date TEXT NOT NULL, contact_method TEXT, parent_name TEXT, notes TEXT, follow_up_required TEXT DEFAULT 'No')` },
    { name: 'mtss_interventions', sql: `CREATE TABLE IF NOT EXISTS mtss_interventions (id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL, tier INTEGER NOT NULL, intervention TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, progress TEXT DEFAULT 'Not Started', notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, intervention_goal TEXT, progress_monitoring TEXT, review_date TEXT, exit_criteria TEXT, incident_link INTEGER REFERENCES incidents(id), advisor TEXT, tier_history JSONB DEFAULT '[]'::jsonb)` },
    { name: 'alerts', sql: `CREATE TABLE IF NOT EXISTS alerts (id SERIAL PRIMARY KEY, alert_type TEXT NOT NULL, threshold INTEGER DEFAULT 3, action TEXT, enabled TEXT DEFAULT 'Yes')` },
    { name: 'settings', sql: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)` },
    { name: 'incident_status_logs', sql: `CREATE TABLE IF NOT EXISTS incident_status_logs (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL, changed_by INTEGER NOT NULL, previous_status TEXT, new_status TEXT NOT NULL, changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notes TEXT)` },
    { name: 'incident_evidence', sql: `CREATE TABLE IF NOT EXISTS incident_evidence (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL, file_name TEXT NOT NULL, file_url TEXT, file_type TEXT, uploaded_by INTEGER NOT NULL, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'user_activity_log', sql: `CREATE TABLE IF NOT EXISTS user_activity_log (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, action TEXT NOT NULL, details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
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

  try {
    await seedViolations();
    await seedAlerts();
    await seedDefaultSettings();
    await createDefaultAdmin();
    console.log('Database initialization complete!');
  } catch (error: any) {
    console.error('Seeding error:', error.message);
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
      v
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

async function createDefaultAdmin() {
  const existing = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
  if (existing.rows.length === 0) {
    const bcrypt = await import('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    await pool.query(
      `INSERT INTO users (username, password, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
      ['admin', hashedPassword, 'admin', 'System', 'Admin']
    );
    console.log('✓ Default admin user created');
  }

  // Ensure Marvin_mcv admin user exists with proper credentials
  await ensureAdminUser('Marvin_mcv', 'gmc190494', 'Marvin', 'MCV');
}

async function ensureAdminUser(username: string, password: string, firstName: string, lastName: string) {
  const bcrypt = await import('bcryptjs');
  const hashedPassword = bcrypt.hashSync(password, 10);

  const existing = await pool.query('SELECT id, role FROM users WHERE username = $1', [username]);

  if (existing.rows.length === 0) {
    // Create new admin user
    await pool.query(
      `INSERT INTO users (username, password, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
      [username, hashedPassword, 'admin', firstName, lastName]
    );
    console.log(`✓ Admin user '${username}' created with full permissions`);
  } else {
    // Update existing user to admin with new password
    await pool.query(
      `UPDATE users SET role = 'admin', password = $1, first_name = $2, last_name = $3 WHERE username = $4`,
      [hashedPassword, firstName, lastName, username]
    );
    console.log(`✓ Admin user '${username}' updated with full permissions`);
  }
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

export default pool;