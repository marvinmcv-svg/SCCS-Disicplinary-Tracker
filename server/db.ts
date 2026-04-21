import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Gmc190494mcv@db.cpdrclazmvboenhlsccf.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function queryOne(sql: string, params: any[] = []): Promise<any | null> {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

export async function runQuery(sql: string, params: any[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
  const result = await pool.query(sql, params);
  return {
    lastInsertRowid: result.rows[0]?.id || 0,
    changes: result.rowCount || 0
  };
}

export async function initializeDatabase() {
  console.log('Connecting to PostgreSQL database...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'dean',
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      student_id TEXT UNIQUE NOT NULL,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      grade INTEGER DEFAULT 9,
      house_team TEXT,
      counselor TEXT,
      gpa REAL DEFAULT 0.0,
      total_points INTEGER DEFAULT 100,
      conduct_status TEXT DEFAULT 'Good',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS violations (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      description TEXT,
      points_deduction INTEGER DEFAULT -2,
      default_consequence TEXT,
      min_oss_days INTEGER DEFAULT 0,
      max_oss_days INTEGER DEFAULT 1
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      incident_id TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      student_id INTEGER NOT NULL,
      violation_id INTEGER NOT NULL,
      location TEXT,
      description TEXT,
      witnesses TEXT,
      parent_contacted TEXT DEFAULT 'No',
      contact_date TEXT,
      action_taken TEXT,
      consequence TEXT,
      points_deducted INTEGER DEFAULT -2,
      days_iss INTEGER DEFAULT 0,
      days_oss INTEGER DEFAULT 0,
      detention_hours REAL DEFAULT 0,
      referral_date TEXT,
      administrator_id INTEGER,
      notes TEXT,
      follow_up_needed TEXT DEFAULT 'No',
      status TEXT DEFAULT 'Open',
      resolved_date TEXT,
      evidence TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_contacts (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER NOT NULL,
      contact_date TEXT NOT NULL,
      contact_method TEXT,
      parent_name TEXT,
      notes TEXT,
      follow_up_required TEXT DEFAULT 'No'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mtss_interventions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      tier INTEGER NOT NULL,
      intervention TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      progress TEXT DEFAULT 'Not Started',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      alert_type TEXT NOT NULL,
      threshold INTEGER DEFAULT 3,
      action TEXT,
      enabled TEXT DEFAULT 'Yes'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await seedViolations();
  await seedAlerts();
  await seedDefaultSettings();
  await createDefaultAdmin();

  console.log('PostgreSQL database initialized successfully!');
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
    ['admin', hashedPassword, 'Administrator', 'System', 'Admin']
  );
}

export default pool;