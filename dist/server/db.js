"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.queryAll = queryAll;
exports.queryOne = queryOne;
exports.runQuery = runQuery;
exports.initializeDatabase = initializeDatabase;
/* eslint-disable @typescript-eslint/no-require-imports */
const initSqlJs = require('sql.js');
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let db = null;
const dbPath = path_1.default.join(__dirname, '../data/discipline.db');
async function loadDatabase() {
    const SQL = await initSqlJs();
    const dataDir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dataDir)) {
        fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
    if (fs_1.default.existsSync(dbPath)) {
        const buffer = fs_1.default.readFileSync(dbPath);
        return new SQL.Database(buffer);
    }
    return new SQL.Database();
}
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs_1.default.writeFileSync(dbPath, buffer);
    }
}
function getDb() {
    if (!db)
        throw new Error('Database not initialized');
    return db;
}
function queryAll(sql, params = []) {
    if (!db)
        throw new Error('Database not initialized');
    const stmt = db.prepare(sql);
    if (params.length)
        stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row);
    }
    stmt.free();
    return results;
}
function queryOne(sql, params = []) {
    const results = queryAll(sql, params);
    return results.length > 0 ? results[0] : null;
}
function runQuery(sql, params = []) {
    if (!db)
        throw new Error('Database not initialized');
    db.run(sql, params);
    saveDatabase();
    const lastId = queryOne('SELECT last_insert_rowid() as id');
    const changes = queryOne('SELECT changes() as c');
    return {
        lastInsertRowid: lastId?.id || 0,
        changes: changes?.c || 0
    };
}
async function initializeDatabase() {
    db = await loadDatabase();
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'dean',
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      grade INTEGER,
      house_team TEXT,
      counselor TEXT,
      gpa REAL DEFAULT 0.0,
      total_points INTEGER DEFAULT 100,
      conduct_status TEXT DEFAULT 'Good',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      description TEXT,
      points_deduction INTEGER DEFAULT -2,
      default_consequence TEXT,
      min_oss_days INTEGER DEFAULT 0,
      max_oss_days INTEGER DEFAULT 1
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (violation_id) REFERENCES violations(id),
      FOREIGN KEY (administrator_id) REFERENCES users(id)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS parent_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      contact_date TEXT NOT NULL,
      contact_method TEXT,
      parent_name TEXT,
      notes TEXT,
      follow_up_required TEXT DEFAULT 'No',
      FOREIGN KEY (incident_id) REFERENCES incidents(id)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS mtss_interventions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      tier INTEGER NOT NULL,
      intervention TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      progress TEXT DEFAULT 'Not Started',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      merit_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      description TEXT,
      awarded_by INTEGER NOT NULL,
      awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (awarded_by) REFERENCES users(id)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_type TEXT NOT NULL,
      threshold INTEGER DEFAULT 3,
      action TEXT,
      enabled TEXT DEFAULT 'Yes'
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
    saveDatabase();
    seedViolations();
    seedAlerts();
    seedDefaultSettings();
    createDefaultAdmin();
}
function seedViolations() {
    const violations = [
        ["Attendance", "Tardy to School", "Arriving late to school without proper excuse (1st: Warning, 4+/week: Friday Detention)", -2, "Warning/Detention", 0, 0],
        ["Attendance", "Tardy to Class", "Arriving late to class without a pass (1st: Warning, 4+/week: Friday Detention)", -2, "Warning/Detention", 0, 0],
        ["Attendance", "Unexcused Absence", "Missing school without parent notification", -3, "Detention/Saturday School", 0, 1],
        ["Attendance", "Class Cut/AWOL", "Deliberately skipping a class or leaving school", -5, "Saturday School/ISS", 0, 2],
        ["Attendance", "Truancy", "Pattern of unexcused absences", -5, "Saturday School/ISS", 1, 3],
        ["Attendance", "Leaving Campus", "Leaving school grounds without permission", -3, "ISS/Parent Conference", 0, 2],
        ["Attendance", "Failure to Serve Detention", "Not reporting to assigned detention", -2, "Extra Detention/ISS", 0, 1],
        ["Classroom Behavior", "Classroom Disruption", "Behavior that interrupts learning", -2, "Warning/Detention", 0, 0],
        ["Classroom Behavior", "Insubordination", "Refusing to comply with staff requests", -3, "Detention/ISS", 0, 1],
        ["Classroom Behavior", "Defiant Behavior", "Openly desafying authority", -3, "ISS/OSS", 0, 3],
        ["Classroom Behavior", "Rude Behavior", "Disrespectful behavior toward staff", -2, "Warning/Detention", 0, 0],
        ["Classroom Behavior", "Inappropriate Language", "Using profanity or vulgar language", -2, "Warning/Detention", 0, 0],
        ["Classroom Behavior", "Offensive Language", "Using offensive remarks to others", -3, "Detention/ISS", 0, 1],
        ["Classroom Behavior", "Leaving Class", "Leaving classroom without permission", -2, "Warning/Detention", 0, 0],
        ["Classroom Behavior", "Out of Area", "Being in unauthorized location", -2, "Warning/Detention", 0, 0],
        ["Classroom Behavior", "No Hall Pass", "Not having proper pass during class time", -1, "Warning", 0, 0],
        ["Classroom Behavior", "Phone Violation", "Using phone during school hours (1st: confiscate 1 week, 2nd: 1 month, 3rd: end of semester)", -2, "Phone Confiscation", 0, 0],
        ["Physical Behavior", "Physical Altercation", "Getting into physical confrontation", -5, "OSS/Behavior Contract", 1, 3],
        ["Physical Behavior", "Fighting", "Engaging in physical combat", -10, "OSS (3-10 days)/Expulsion", 3, 10],
        ["Physical Behavior", "Instigating Fight", "Encouraging or organizing fighting", -5, "OSS/Behavior Contract", 1, 3],
        ["Physical Behavior", "Horseplay", "Rough or unsafe play", -2, "Warning/Detention", 0, 0],
        ["Academic Integrity", "Plagiarism", "Using work without proper citation (1st: resubmit max 60, 2nd: zero, 3rd: suspension)", -5, "Zero/Conference", 0, 0],
        ["Academic Integrity", "Cheating", "Academic dishonesty on tests/assignments (1st: resubmit max 60, 2nd: zero, 3rd: suspension)", -5, "Zero/Suspension", 0, 1],
        ["Academic Integrity", "Forgery", "Falsifying documents or signatures", -5, "OSS/Expulsion", 0, 5],
        ["Academic Integrity", "Homework Copying", "Copying homework from another student", -3, "Zero/Detention", 0, 0],
        ["Dress Code", "Dress Code Violation", "Not adhering to school dress code (1st-2nd: change clothes, 3rd: Friday detention)", -2, "Warning/Detention", 0, 0],
        ["Dress Code", "Inappropriate PDA", "Public displays not appropriate", -2, "Warning/Parent Call", 0, 0],
        ["Tobacco/Alcohol/Drugs", "Tobacco Possession", "Possessing tobacco products on campus", -5, "3-Day OSS", 3, 3],
        ["Tobacco/Alcohol/Drugs", "Tobacco Use", "Using tobacco on campus", -5, "5-Day OSS", 5, 5],
        ["Tobacco/Alcohol/Drugs", "Alcohol Possession", "Possessing alcohol on campus", -10, "5-Day OSS", 5, 5],
        ["Tobacco/Alcohol/Drugs", "Alcohol Use", "Using alcohol on campus", -10, "10-Day OSS", 10, 10],
        ["Tobacco/Alcohol/Drugs", "Drug Possession", "Possessing illegal drugs/medication without prescription", -15, "10+ Day OSS/Expulsion", 10, 30],
        ["Tobacco/Alcohol/Drugs", "Drug Distribution", "Selling or distributing drugs on campus", -20, "Expulsion", 30, 99],
        ["Tobacco/Alcohol/Drugs", "Vaping", "Using e-cigarettes on campus", -5, "3-Day OSS", 3, 3],
        ["Tobacco/Alcohol/Drugs", "Under Influence", "Appearing on campus under influence of alcohol/drugs", -15, "OSS/Expulsion", 5, 10],
        ["Bullying/Harassment", "Bullying", "Intimidating or harassing behavior", -5, "OSS/Behavior Contract", 3, 5],
        ["Bullying/Harassment", "Harassment", "Repeated unwanted behavior", -5, "OSS/Behavior Contract", 3, 5],
        ["Bullying/Harassment", "Cyberbullying", "Online harassment", -5, "OSS/Behavior Contract", 3, 5],
        ["Bullying/Harassment", "Threats", "Threatening to harm others", -10, "OSS/Expulsion", 5, 10],
        ["Bullying/Harassment", "Teasing", "Teasing/intimidation of peers", -3, "Warning/Detention", 0, 1],
        ["Bullying/Harassment", "Inappropriate Gestures", "Inappropriate gestures toward others", -3, "Warning/Detention", 0, 1],
        ["Hazing", "Hazing", "Forced behavior for group initiation", -10, "OSS/Expulsion", 3, 10],
        ["Weapons", "Weapons Possession", "Possessing weapons on campus", -25, "Expulsion", 99, 99],
        ["Weapons", "Look-alike Weapons", "Items resembling weapons", -15, "OSS/Expulsion", 5, 15],
        ["Weapons", "Dangerous Objects", "Possessing dangerous objects", -15, "OSS/Expulsion", 5, 15],
        ["Property", "Theft", "Stealing property", -10, "OSS/Restitution", 0, 5],
        ["Property", "Vandalism", "Deliberately damaging property", -10, "OSS/Restitution", 0, 5],
        ["Property", "Locker Damage", "Damaging school-issued locker", -5, "Restitution/Warning", 0, 0],
        ["Technology", "AUP Violation", "Violating technology use policy", -2, "Warning/Loss of Access", 0, 0],
        ["Technology", "Unauthorized Access", "Hacking or unauthorized system access", -5, "OSS/Referral", 0, 3],
        ["Technology", "Teacher Computer Use", "Using teacher's computer without permission", -10, "Immediate Suspension", 1, 3],
        ["Technology", "Cyber Violation", "Misuse of institutional email or social media", -5, "OSS/Behavior Contract", 0, 5],
        ["Safety", "Fire Alarm Misuse", "Pulling fire alarm without cause", -5, "OSS", 1, 3],
        ["Safety", "False Reports", "Making false emergency reports", -5, "OSS", 1, 3],
        ["Safety", "Weapon Threats", "Threatening with weapon or fake weapon", -20, "Expulsion", 10, 99],
        ["Safety", "Safety Violation", "Compromising safety of others", -5, "ISS/OSS", 0, 5],
    ];
    for (const v of violations) {
        db.run(`
      INSERT OR IGNORE INTO violations (category, violation_type, description, points_deduction, default_consequence, min_oss_days, max_oss_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, v);
    }
    saveDatabase();
}
function seedAlerts() {
    const alerts = [
        ["Repeat Offender", 3, "Auto-flag when student has 3+ incidents in 30 days", "Yes"],
        ["Chronic Absences", 5, "Referral when student has 5+ unexcused absences", "Yes"],
        ["OSS Limit", 10, "Admin review required when OSS reaches 10 days", "Yes"],
        ["Same Violation", 3, "MTSS meeting required for 3+ same violation type", "Yes"],
        ["Zero GPA", 1, "Counselor alert when GPA drops below 1.0", "Yes"],
        ["Parent No Contact", 3, "Admin alert after 3 failed contact attempts", "Yes"],
    ];
    for (const a of alerts) {
        db.run(`
      INSERT OR IGNORE INTO alerts (alert_type, threshold, action, enabled)
      VALUES (?, ?, ?, ?)
    `, a);
    }
    saveDatabase();
}
function seedDefaultSettings() {
    const settings = [
        ["school_name", "Your School"],
        ["academic_year", "2025-2026"],
        ["max_points", "100"],
        ["passing_threshold", "60"],
    ];
    for (const s of settings) {
        db.run(`
      INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
    `, s);
    }
    saveDatabase();
}
function createDefaultAdmin() {
    const adminExists = queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        const hashedPassword = bcryptjs_1.default.hashSync('admin123', 10);
        db.run(`
      INSERT INTO users (username, password, role, first_name, last_name)
      VALUES (?, ?, ?, ?, ?)
    `, ['admin', hashedPassword, 'Administrator', 'System', 'Admin']);
        saveDatabase();
    }
}
