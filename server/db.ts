import { Pool } from 'pg';
import dns from 'dns';

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

export async function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error: any) {
    console.error('Query error:', error.message);
    throw error;
  }
}

export async function queryOne(sql: string, params: any[] = []): Promise<any | null> {
  try {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  } catch (error: any) {
    console.error('Query error:', error.message);
    throw error;
  }
}

export async function runQuery(sql: string, params: any[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
  try {
    const result = await pool.query(sql, params);
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
  } catch (e) {
    console.log('Connection test failed, will retry with queries...');
  }

  const tableQueries = [
    { name: 'users', sql: `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'dean', first_name TEXT, last_name TEXT, email TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'students', sql: `CREATE TABLE IF NOT EXISTS students (id SERIAL PRIMARY KEY, student_id TEXT UNIQUE NOT NULL, last_name TEXT NOT NULL, first_name TEXT NOT NULL, grade INTEGER DEFAULT 9, house_team TEXT, counselor TEXT, gpa REAL DEFAULT 0.0, total_points INTEGER DEFAULT 100, conduct_status TEXT DEFAULT 'Good', observations TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'violations', sql: `CREATE TABLE IF NOT EXISTS violations (id SERIAL PRIMARY KEY, category TEXT NOT NULL, violation_type TEXT NOT NULL, description TEXT, points_deduction INTEGER DEFAULT -2, default_consequence TEXT, min_oss_days INTEGER DEFAULT 0, max_oss_days INTEGER DEFAULT 1)` },
    { name: 'incidents', sql: `CREATE TABLE IF NOT EXISTS incidents (id SERIAL PRIMARY KEY, incident_id TEXT UNIQUE NOT NULL, date TEXT NOT NULL, time TEXT, student_id INTEGER NOT NULL, violation_id INTEGER NOT NULL, location TEXT, description TEXT, witnesses TEXT, parent_contacted TEXT DEFAULT 'No', contact_date TEXT, action_taken TEXT, consequence TEXT, points_deducted INTEGER DEFAULT -2, days_iss INTEGER DEFAULT 0, days_oss INTEGER DEFAULT 0, detention_hours REAL DEFAULT 0, referral_date TEXT, administrator_id INTEGER, notes TEXT, follow_up_needed TEXT DEFAULT 'No', status TEXT DEFAULT 'Open', resolved_date TEXT, evidence TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'parent_contacts', sql: `CREATE TABLE IF NOT EXISTS parent_contacts (id SERIAL PRIMARY KEY, incident_id INTEGER NOT NULL, contact_date TEXT NOT NULL, contact_method TEXT, parent_name TEXT, notes TEXT, follow_up_required TEXT DEFAULT 'No')` },
    { name: 'mtss_interventions', sql: `CREATE TABLE IF NOT EXISTS mtss_interventions (id SERIAL PRIMARY KEY, student_id INTEGER NOT NULL, tier INTEGER NOT NULL, intervention TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, progress TEXT DEFAULT 'Not Started', notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'alerts', sql: `CREATE TABLE IF NOT EXISTS alerts (id SERIAL PRIMARY KEY, alert_type TEXT NOT NULL, threshold INTEGER DEFAULT 3, action TEXT, enabled TEXT DEFAULT 'Yes')` },
    { name: 'settings', sql: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)` },
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

  const violations = [
    ["Attendance", "Tardy to School", "Arriving late to school without proper excuse", -2, "Warning", 0, 0],
    ["Attendance", "Tardy to Class", "Arriving late to class without a pass", -2, "Warning", 0, 0],
    ["Attendance", "Unexcused Absence", "Missing school without parent notification", -3, "Detention", 0, 1],
    ["Attendance", "Class Cut/AWOL", "Skipping class or leaving school", -5, "Saturday School", 0, 2],
    ["Classroom Behavior", "Classroom Disruption", "Behavior that interrupts learning", -2, "Warning", 0, 0],
    ["Classroom Behavior", "Insubordination", "Refusing to comply with staff requests", -3, "Detention", 0, 1],
    ["Classroom Behavior", "Defiant Behavior", "Openly defying authority", -3, "ISS", 0, 3],
    ["Classroom Behavior", "Inappropriate Language", "Using profanity or vulgar language", -2, "Warning", 0, 0],
    ["Physical Behavior", "Physical Altercation", "Getting into physical confrontation", -5, "OSS", 1, 3],
    ["Physical Behavior", "Fighting", "Engaging in physical combat", -10, "OSS", 3, 10],
    ["Academic Integrity", "Cheating", "Academic dishonesty on tests/assignments", -5, "Zero", 0, 1],
    ["Academic Integrity", "Plagiarism", "Using work without proper citation", -5, "Zero", 0, 0],
    ["Dress Code", "Dress Code Violation", "Not adhering to school dress code", -2, "Warning", 0, 0],
    ["Tobacco/Alcohol/Drugs", "Tobacco Possession", "Possessing tobacco on campus", -5, "3-Day OSS", 3, 3],
    ["Tobacco/Alcohol/Drugs", "Vaping", "Using e-cigarettes on campus", -5, "3-Day OSS", 3, 3],
    ["Bullying/Harassment", "Bullying", "Intimidating or harassing behavior", -5, "OSS", 3, 5],
    ["Bullying/Harassment", "Threats", "Threatening to harm others", -10, "OSS", 5, 10],
    ["Weapons", "Weapons Possession", "Possessing weapons on campus", -25, "Expulsion", 99, 99],
    ["Property", "Theft", "Stealing property", -10, "OSS", 0, 5],
    ["Property", "Vandalism", "Deliberately damaging property", -10, "OSS", 0, 5],
    ["Technology", "AUP Violation", "Violating technology use policy", -2, "Warning", 0, 0],
    ["Safety", "Fire Alarm Misuse", "Pulling fire alarm without cause", -5, "OSS", 1, 3],
  ];

  for (const v of violations) {
    await pool.query(
      `INSERT INTO violations (category, violation_type, description, points_deduction, default_consequence, min_oss_days, max_oss_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
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
  if (existing.rows.length > 0) return;

  const bcrypt = await import('bcryptjs');
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  await pool.query(
    `INSERT INTO users (username, password, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
    ['admin', hashedPassword, 'admin', 'System', 'Admin']
  );
}

async function migrateUsersTable() {
  const columns = [
    { name: 'email', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT' },
    { name: 'phone', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT' },
    { name: 'classroom', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS classroom TEXT' },
    { name: 'profile_picture', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT' },
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