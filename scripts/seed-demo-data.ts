#!/usr/bin/env bun
/**
 * seed-demo-data.ts — Seed rich DEMO data into the SCCS Discipline Tracker database.
 *
 * What it inserts (all fake, deterministic — seeded PRNG, so every run produces
 * the same dataset):
 *   - 600 students   (student_id S-2026-002 … S-2026-601)
 *   - ~900 incidents (incident_id uses the app's own `YYMMDD-NNN` per-day format,
 *                     sequenced AFTER any existing incident ids for that day)
 *   - ~75 MTSS interventions (Tiers 1-3, progress Not Started / In Progress / Completed)
 *   - ~1 parent contact row per ~30% of Resolved incidents
 *   - Recomputes students.total_points / conduct_status from the seeded incidents
 *
 * What it NEVER touches:
 *   - Student "Jane Doe" (S-2026-001) and her incident 260912-001
 *   - The 22 violations, alerts, settings and the admin user
 *
 * IDEMPOTENT / safely re-runnable:
 *   Before inserting, it deletes only previously seeded DEMO rows (in FK order:
 *   incident_status_logs / parent_contacts / incident_evidence of demo incidents →
 *   mtss_interventions → demo incidents → demo students, where "demo" =
 *   student_id BETWEEN 'S-2026-002' AND 'S-2026-601'). Run it as often as you like:
 *
 *     cd /home/z/my-project && bun sccs/scripts/seed-demo-data.ts
 *
 * Connection: uses $SCCS_DB_URL if set; otherwise $DATABASE_URL only when it points
 * at the sccs_discipline database (the root Prisma .env is a SQLite file and is
 * ignored); otherwise falls back to the local trust-auth sandbox default
 * postgresql://discipline@127.0.0.1:5432/sccs_discipline. No secrets hardcoded.
 *
 * Sandbox "today" is 2026-09-12 (a Saturday — the app itself recorded incident
 * 260912-001 today, so today is treated as the one allowed weekend exception).
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViolationRow {
  id: number;
  violation_type: string;
  severity: string;
  points_deduction: number;
  default_consequence: string | null;
}

interface StudentSeed {
  student_id: string;
  last_name: string;
  first_name: string;
  grade: number;
  section: string;
  house_team: string;
  counselor: string;
  advisory: string;
  gpa: number;
  total_points: number;
  conduct_status: string;
  observations: string;
  date_of_birth: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  gender: 'M' | 'F';
}

interface Sanction { days_iss: number; days_oss: number; detention_hours: number }

interface IncidentSeed {
  studentIdx: number;            // index into students array (fk resolved after insert)
  date: string;                  // YYYY-MM-DD
  time: string;                  // HH:MM
  violation: ViolationRow;
  ordinal: number;               // 1st/2nd/3rd… incident for that student (escalation)
  location: string;
  description: string;
  witnesses: string | null;
  parent_contacted: 'Yes' | 'No';
  contact_date: string | null;
  action_taken: string | null;
  consequence: string | null;
  points_deducted: number;
  days_iss: number;
  days_oss: number;
  detention_hours: number;
  referral_date: string | null;
  administrator_id: number;
  notes: string | null;
  follow_up_needed: 'Yes' | 'No';
  follow_up_date: string | null;
  status: 'Open' | 'Pending' | 'Resolved';
  resolved_date: string | null;
  reported_by: string | null;
  escalated_to_principal: boolean;
  principal_notified_at: string | null;
  created_at: string;            // 'YYYY-MM-DD HH:MM:SS'
  advisor: string | null;        // student's counselor (matches app's advisor column)
  incident_id: string;           // assigned after dates are known (YYMMDD-NNN)
}

interface MtssSeed {
  studentIdx: number;
  tier: 1 | 2 | 3;
  intervention: string;
  start_date: string;
  end_date: string | null;
  progress: 'Not Started' | 'In Progress' | 'Completed';
  notes: string | null;
  intervention_goal: string;
  progress_monitoring: string;
  review_date: string | null;
  exit_criteria: string;
  incident_link: number | null;  // incidents.id (serial), set after insert
  advisor: string;
  tier_history: unknown;         // JSONB
}

interface ParentContactSeed {
  incidentDbId: number;
  contact_date: string;
  contact_method: 'Phone' | 'Email' | 'In Person';
  parent_name: string;
  notes: string;
  follow_up_required: 'No';
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — same data on every re-run
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260912);

const rint = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number): boolean => rand() < p;
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rand() * arr.length)]; }
function wpick<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------------------
// Date helpers (all UTC, ISO 'YYYY-MM-DD' text like the app itself uses)
// ---------------------------------------------------------------------------

const TODAY = '2026-09-12';
const DAY_MS = 86_400_000;
const toUtc = (iso: string): Date => new Date(iso + 'T00:00:00Z');
const fmt = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string => fmt(new Date(toUtc(iso).getTime() + n * DAY_MS));
const daysBetween = (a: string, b: string): number => Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
const dow = (iso: string): number => toUtc(iso).getUTCDay(); // 0=Sun … 6=Sat
const isWeekend = (iso: string): boolean => dow(iso) === 0 || dow(iso) === 6;
const inSummer = (iso: string): boolean => iso >= '2026-06-15' && iso <= '2026-08-10';
const isSchoolDay = (iso: string): boolean => !isWeekend(iso) && !inSummer(iso);
const clampISO = (iso: string, lo: string, hi: string): string => (iso < lo ? lo : iso > hi ? hi : iso);

function schoolDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isSchoolDay(d)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Static banks (staff / template text)
// ---------------------------------------------------------------------------

// Staff names below are the app's OWN hardcoded staff list (allAdvisors in
// client/src/pages/MTSS.tsx) — using them keeps the demo data consistent with
// the MTSS advisor filter and the incident "Assigned To" column, which only
// know these exact spellings ('Mr Adachi', 'MrDiPascuale', …).
const APP_STAFF = [
  'Mr Adachi', 'Mr Cohello', 'MrDiPascuale', 'Mr Kane', 'Mr Ortiz', 'Ms Aguirre',
  'Ms Camacho', 'Ms Fernandez', 'Ms Guaristi', 'Ms Hopp', 'Ms Meneses', 'Ms Molina',
  'Ms Palacios', 'Ms Rios', 'Ms Robinson', 'Ms Skelly', 'Ms Tello', 'Ms Tomelic',
  'Ms Zuazo', 'Mr Coronado', 'Mr Herbert', 'Mr Kreller', 'Mr Odekerken', 'Mr Soliz',
] as const;

// Counselors (students.counselor, incident advisor, MTSS advisor)
const COUNSELORS = APP_STAFF.slice(0, 8) as unknown as readonly string[];

// Teachers (advisory room labels, incident reported_by)
const TEACHERS = APP_STAFF.slice(8) as unknown as readonly string[];

const HOUSES = ['Red', 'Blue', 'Gold', 'Green'] as const;
const LOCATIONS = ['Classroom', 'Hallway', 'Cafeteria', 'Playground', 'Gym', 'Restroom', 'Library', 'School Bus', 'School Grounds', 'Parking Lot'] as const;

// Ethnically diverse US-school-style name pools (gender-tagged first names).
const FEMALE_FIRSTS = [
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Emma', 'Olivia', 'Sophia', 'Isabella', 'Mia', 'Charlotte',
  'Amelia', 'Harper', 'Evelyn', 'Abigail', 'Emily', 'Ella', 'Avery', 'Sofia', 'Camila', 'Aria',
  'Luna', 'Maria', 'Guadalupe', 'Ximena', 'Valentina', 'Alejandra', 'Gabriela', 'Daniela', 'Adriana', 'Renata',
  'Destiny', 'Aaliyah', 'Imani', 'Nia', 'Keisha', 'Amara', 'Maya', 'Alicia', 'Zaria', 'Jada',
  'Layla', 'Amira', 'Noor', 'Yasmin', 'Maryam', 'Fatima', 'Hana', 'Sakura', 'Emi', 'Yui',
  'Priya', 'Ananya', 'Divya', 'Meera', 'Asha', 'Linh', 'Mai', 'Thao', 'Madison', 'Chloe',
  'Victoria', 'Riley', 'Nora', 'Hazel', 'Ellie', 'Stella', 'Natalie', 'Zoe', 'Lily', 'Hannah',
  'Scarlett', 'Grace', 'Aurora', 'Violet', 'Naomi', 'Lucia', 'Genesis', 'Leilani', 'Milena', 'Anika',
] as const;

const MALE_FIRSTS = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Joseph', 'Daniel', 'Matthew', 'Lucas',
  'Ethan', 'Alexander', 'Benjamin', 'Henry', 'Jack', 'Owen', 'Samuel', 'Ryan', 'Nathan', 'Caleb',
  'Dylan', 'Isaac', 'Luke', 'Gabriel', 'Anthony', 'Elijah', 'Mason', 'Logan', 'Jacob', 'Liam',
  'Noah', 'Carlos', 'Juan', 'Miguel', 'Diego', 'Alejandro', 'Jose', 'Xavier', 'Andres', 'Marco',
  'Luis', 'Santiago', 'Mateo', 'Julian', 'Emiliano', 'Rodrigo', 'Isaiah', 'Jayden', 'Jamal', 'DeShawn',
  'Malik', 'Jalen', 'Andre', 'Marcus', 'Tyrell', 'Amir', 'Omar', 'Hassan', 'Yusuf', 'Khalil',
  'Ibrahim', 'Jun', 'Hao', 'Kenji', 'Hiro', 'Taro', 'Ryo', 'Minh', 'Anh', 'Long',
  'Arjun', 'Rohan', 'Vikram', 'Dev', 'Ravi', 'Karim', 'Nasir', 'Tobias', 'Felix', 'Omarion',
] as const;

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Martinez', 'Davis', 'Rodriguez', 'Lopez',
  'Hernandez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee',
  'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green',
  'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Turner',
  'Phillips', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Rogers', 'Reed', 'Cook',
  'Morgan', 'Bell', 'Murphy', 'Bailey', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Peterson',
  'Gray', 'Watson', 'Brooks', 'Kelly', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes', 'Ross',
  'Henderson', 'Coleman', 'Jenkins', 'Perry', 'Powell', 'Patterson', 'Hughes', 'Washington', 'Butler', 'Simmons',
  'Foster', 'Gonzales', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Diaz', 'Hayes', 'Myers', 'Ford',
  'Hamilton', 'Graham', 'Sullivan', 'Wallace', 'Woods', 'Cole', 'West', 'Jordan', 'Owens', 'Reynolds',
  'Fisher', 'Ellis', 'Harrison', 'Gibson', 'McDonald', 'Marshall', 'Ortiz', 'Chen', 'Wang', 'Li',
  'Zhang', 'Kim', 'Park', 'Patel', 'Shah', 'Singh', 'Rao', 'Gupta', 'Khan', 'Ali',
  'Hassan', 'Haddad', 'Rahman', 'Tran', 'Pham', 'Vuong', 'Dang', 'Tanaka', 'Sato', 'Nakamura',
] as const;

const OBSERVATION_BANK = [
  'Transferred in from out of district in January.',
  'IEP in place for reading comprehension.',
  'English language learner — intermediate proficiency.',
  'Transportation difficulties documented; working with family.',
  'Student council representative; strong leadership skills.',
  'Medical alert: asthma inhaler on file with nurse.',
  'Tutoring twice weekly after school in math.',
  'New to the district this school year; still adjusting.',
  'Excellent attendance record prior to this semester.',
  'Receives weekend meal backpack program support.',
  'Gifted and talented screening scheduled for October.',
  'Prefers follow-up conversations one-on-one rather than in class.',
] as const;

const ACTION_TAKEN_RESOLVED = [
  'Parent contacted by phone; conference held with student.',
  'Detention assigned and served; parent notified.',
  'Student conference held; restorative conversation completed.',
  'ISS assigned and completed; missed work made up.',
  'Parent meeting held with administrator and student.',
  'Saturday School assigned; parent acknowledged via email.',
  'Warning issued and documented; parent notified.',
  'Behavior contract reviewed and signed by student and parent.',
  'Counselor follow-up session completed.',
  'Restitution completed; apology accepted by affected party.',
] as const;

const ACTION_TAKEN_PENDING = [
  'Parent contact attempted — awaiting callback.',
  'Conference requested; awaiting parent scheduling.',
  'Detention pending assignment.',
  'Under administrative review.',
  'Referred to counselor; session being scheduled.',
  'Awaiting teacher witness statement.',
] as const;

const NOTES_BANK = [
  'Parent notified via phone.',
  'Conference scheduled with student.',
  'Student apologized and made restitution.',
  'Referred to counselor for follow-up.',
  'Behavior plan reviewed with student.',
  'Repeat behavior — consequence escalated per handbook.',
  'Staff on duty confirmed details of the incident.',
  'Pattern of similar behavior this semester.',
  'No prior incidents on file for this student.',
  'Student was cooperative during the office conference.',
  'Bus video reviewed as part of the investigation.',
  'Peer conflict mediation scheduled.',
] as const;

const DESCRIPTION_TEMPLATES = [
  'Reported {v} in the {loc}. Staff on duty documented the incident and followed the student handbook.',
  '{v} in the {loc} during the school day. The student was escorted to the office and met with an administrator.',
  'Student was involved in {v} in the {loc}. A witness statement was collected and filed with the referral.',
  'Incident of {v} in the {loc}. Student acknowledged the behavior when conferenced by staff.',
  '{v} observed in the {loc}. Classroom teacher submitted a written referral to the front office.',
  'Staff reported {v} in the {loc}. The student was removed from the setting and parents were notified of the referral.',
  '{v} in the {loc} disrupting the learning environment. Administrative conference held with the student.',
  'A {v} incident was reported in the {loc}. The reporting staff member documented the time and individuals involved.',
  'Student involved in {v} in the {loc}. Behavior reviewed against the code of conduct and consequences assigned.',
  '{v} in the {loc}. Student was given the opportunity to explain and a written statement was filed.',
] as const;

const MTSS_INTERVENTIONS: Record<1 | 2 | 3, readonly string[]> = {
  1: ['Check-In/Check-Out (CICO)', 'Small Group Counseling', 'Restorative Circles'],
  2: ['Behavior Contract', 'Mentoring Program', 'Social Skills Group', 'Academic Intervention Plan', 'Family-School Partnership'],
  3: ['Individual Counseling', 'Functional Behavior Assessment', 'Behavior Contract', 'Mentoring Program'],
};

const MTSS_GOALS = [
  'Student will demonstrate on-task behavior in 80% of observed classroom intervals.',
  'Student will arrive to all classes on time for five consecutive school days.',
  'Student will use taught coping strategies instead of escalating conflict situations.',
  'Student will complete 90% of assigned work in the supported class period.',
  'Student will have zero office referrals for physical aggression this quarter.',
  'Student will raise their daily point-sheet average to 80% or higher.',
  'Student will participate positively in group activities two times per week.',
] as const;

const MTSS_MONITORING = [
  'Weekly behavior tracking sheet',
  'Daily CICO point card',
  'Bi-weekly teacher rating scale',
  'Weekly progress report sent home',
  'Daily agenda and assignment checks',
  'Weekly counselor check-in notes',
] as const;

const MTSS_EXIT_CRITERIA = [
  'No major office referrals for four consecutive weeks.',
  'Meets daily points goal for six consecutive weeks.',
  'Teacher-reported improvement sustained for one full month.',
  'Passing all classes with no new disciplinary referrals for a grading period.',
  'Demonstrates replacement behaviors independently across two settings.',
] as const;

const MTSS_NOTES = [
  'Family engaged and supportive of the plan.',
  'Teachers implementing strategies consistently.',
  'Attendance at scheduled sessions has been good.',
  'Adjustments made after first review meeting.',
  'Student responds well to positive reinforcement.',
  'Plan shared with all core teachers.',
] as const;

const TIER_CHANGE_REASONS = [
  'Insufficient response to previous tier of supports.',
  'Data review showed escalating incident frequency.',
  'Team decision at monthly MTSS meeting.',
  'Parent requested additional support at conference.',
] as const;

const PARENT_CONTACT_NOTES = [
  'Discussed the incident and consequences; parent was supportive.',
  'Parent acknowledged the report and agreed to follow up at home.',
  'Left voicemail; parent returned the call the same day.',
  'Emailed a copy of the referral; parent confirmed receipt.',
  'In-person meeting held during the parent conference period.',
  'Parent requested a follow-up meeting with the counselor.',
] as const;

// ---------------------------------------------------------------------------
// Config knobs
// ---------------------------------------------------------------------------

const DEMO_ID_MIN = 'S-2026-002';
const DEMO_ID_MAX = 'S-2026-601';
const DEMO_STUDENT_COUNT = 600;

// grade 0 (Pre-K/K) → 20; grades 1-5 → 55 each; grades 6-8 → 60 each.
// Spec's suggested 57/grade for 9-12 would total 703, so the 9-12 group is
// adjusted (31/31/31/32) to make the sum exactly 600.
const GRADE_PLAN: Record<number, number> = {
  0: 20, 1: 55, 2: 55, 3: 55, 4: 55, 5: 55,
  6: 60, 7: 60, 8: 60,
  9: 31, 10: 31, 11: 31, 12: 32,
};

const TOTAL_INCIDENT_TARGET = 900;

// Incident-count cohorts (see header): ~25% one incident, ~12% two, repeat
// offenders (3-7 incidents) scaled up so the total reaches ~900 — the spec's
// 55/25/12/8 split caps out around 630 incidents, so zero% is relaxed instead.
const COHORTS = {
  grade0Singles: 2,   // at most 1-2 incidents in Pre-K/K
  oneIncident: 150,   // 25%
  twoIncidents: 72,   // 12%
  repeatOffenders: 100, // 3-7 incidents each (Repeat Offender alert fires at 3+)
};

// Calendar buckets (percent of all incidents). The spec's "65% in the last 90
// days" collides with the no-summer rule (Jun 15-Aug 10 empty), so the share
// that would fall in summer is placed in the late-spring ramp instead.
const DATE_BUCKETS: { range: [string, string]; weight: number; label: string }[] = [
  { range: ['2026-09-06', '2026-09-12'], weight: 0.08, label: 'last 7 days' },      // A
  { range: ['2026-08-13', '2026-09-05'], weight: 0.22, label: 'last 30 days (excl. A)' }, // B
  { range: ['2026-08-11', '2026-08-12'], weight: 0.02, label: 'session start' },    // C
  { range: ['2026-05-01', '2026-06-14'], weight: 0.33, label: 'late spring' },      // D
  { range: ['2025-12-01', '2026-04-30'], weight: 0.35, label: 'winter/spring' },    // E
];

// Status likelihood by age of the incident → overall ≈ 30% Open / 20% Pending / 50% Resolved.
const STATUS_WEIGHTS_BY_AGE: { maxAgeDays: number; w: [number, number, number] }[] = [
  { maxAgeDays: 7, w: [75, 25, 0] },    // [Open, Pending, Resolved]
  { maxAgeDays: 30, w: [48, 30, 22] },
  { maxAgeDays: 90, w: [24, 20, 56] },
  { maxAgeDays: 9999, w: [16, 17, 67] },
];

const CONSEQUENCE_LADDER = ['Warning', 'Detention', 'Saturday School', 'ISS', 'OSS', '3-Day OSS', 'Expulsion'] as const;

// ---------------------------------------------------------------------------
// Small generation helpers
// ---------------------------------------------------------------------------

function consequenceFor(v: ViolationRow, ordinal: number): string {
  const def = v.default_consequence || 'Warning';
  if (def === 'Expulsion') return 'Expulsion'; // never de-escalate weapons possession
  if (def === 'Zero') {
    // Academic penalty (cheating/plagiarism): first offense keeps the zero,
    // repeats add school-based consequences.
    if (ordinal <= 1) return 'Zero';
    if (ordinal === 2) return chance(0.5) ? 'Zero' : 'Detention';
    return CONSEQUENCE_LADDER[Math.min(1 + (ordinal >= 4 ? 1 : 0) + (ordinal >= 6 ? 1 : 0), 4)];
  }
  const baseIdx = CONSEQUENCE_LADDER.indexOf(def as (typeof CONSEQUENCE_LADDER)[number]);
  let esc = 0;
  if (ordinal === 2) esc = chance(0.3) ? 1 : 0;
  else if (ordinal <= 4) esc = 1;
  else esc = chance(0.6) ? 1 : 2;
  return CONSEQUENCE_LADDER[Math.max(0, Math.min(baseIdx + esc, 5))]; // cap at 3-Day OSS
}

function sanctionFor(consequence: string): Sanction {
  switch (consequence) {
    case 'Detention': return { days_iss: 0, days_oss: 0, detention_hours: pick([1, 1.5, 2, 2.5, 3, 4]) };
    case 'Saturday School': return { days_iss: 0, days_oss: 0, detention_hours: pick([2, 3, 4]) };
    case 'ISS': return { days_iss: rint(1, 3), days_oss: 0, detention_hours: 0 };
    case 'OSS': return { days_iss: 0, days_oss: rint(1, 5), detention_hours: 0 };
    case '3-Day OSS': return { days_iss: 0, days_oss: 3, detention_hours: 0 };
    case 'Expulsion': return { days_iss: 0, days_oss: 5, detention_hours: 0 }; // pending hearing
    default: return { days_iss: 0, days_oss: 0, detention_hours: 0 }; // Warning / Zero
  }
}

function statusFor(date: string): 'Open' | 'Pending' | 'Resolved' {
  const age = daysBetween(date, TODAY);
  const bucket = STATUS_WEIGHTS_BY_AGE.find((b) => age <= b.maxAgeDays)!;
  return wpick(['Open', 'Pending', 'Resolved'] as const, bucket.w);
}

function randTime(): string {
  const mins = rint(7 * 60 + 30, 15 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function randGpa(): number {
  const r = rand();
  let g: number;
  if (r < 0.70) g = 2.3 + rand() * 1.5;        // mostly 2.3–3.8
  else if (r < 0.88) g = 1.5 + rand() * 0.8;
  else if (r < 0.95) g = 0.5 + rand() * 1.0;
  else g = 3.8 + rand() * 0.2;
  return Math.round(Math.min(4.0, Math.max(0.5, g)) * 100) / 100;
}

function makePhone(): string {
  return `(${rint(201, 989)}) ${rint(200, 999)}-${rint(1000, 9999)}`;
}

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------

function resolveDbUrl(): string {
  const DEFAULT = 'postgresql://discipline@127.0.0.1:5432/sccs_discipline';
  if (process.env.SCCS_DB_URL) return process.env.SCCS_DB_URL;
  // bun auto-loads the root .env (Prisma SQLite) — only accept DATABASE_URL
  // when it actually points at this app's database.
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sccs_discipline')) {
    return process.env.DATABASE_URL;
  }
  try {
    const envPath = path.join(__dirname, '..', '..', 'mini-services', 'discipline-api', '.env');
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
      const v = m?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (v && v.includes('sccs_discipline')) return v;
    }
  } catch { /* fall through to default */ }
  return DEFAULT;
}

interface InsertOptions { returning: string; chunkSize?: number }

/** Batched multi-row INSERT; returns the rows produced by RETURNING. */
async function insertBatch<T extends Record<string, unknown>>(
  client: Client, table: string, columns: readonly string[], rows: T[], opts: InsertOptions,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const chunkSize = opts.chunkSize ?? 100;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row, i) =>
      '(' + columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ') + ')');
    for (const row of chunk) for (const c of columns) values.push(row[c] ?? null);
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} RETURNING ${opts.returning}`;
    const res = await client.query(sql, values);
    out.push(...(res.rows as Record<string, unknown>[]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dbUrl = resolveDbUrl();
  const client = new Client({
    connectionString: dbUrl,
    ssl: /localhost|127\.0\.0\.1/.test(dbUrl) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Connected to: ${dbUrl.replace(/:[^:@/]+@/, ':***@')}`);

  try {
    await client.query('BEGIN');

    // -------------------------------------------------------------------
    // 0) Pull violation metadata (never hardcode points/severity/consequences)
    // -------------------------------------------------------------------
    const vRes = await client.query<ViolationRow>(
      'SELECT id, violation_type, severity, points_deduction, default_consequence FROM violations WHERE id BETWEEN 1 AND 22 ORDER BY id');
    const violations = vRes.rows;
    if (violations.length !== 22) throw new Error(`expected 22 violations, found ${violations.length}`);
    const bySeverity = (sev: string): ViolationRow[] => violations.filter((v) => v.severity === sev);
    const LOW = bySeverity('Low'), MED = bySeverity('Medium'), HIGH = bySeverity('High'), CRIT = bySeverity('Critical');
    // Violations that make no sense for elementary students → redrawn below.
    const ELEMENTARY_BLOCKLIST = new Set(['Tobacco Possession', 'Vaping', 'Class Cut/AWOL']);

    function pickViolation(grade: number, ordinal: number): ViolationRow {
      const severityWeights = ordinal <= 1 ? [60, 20, 15, 5]
        : ordinal === 2 ? [52, 22, 19, 7]
        : ordinal <= 4 ? [44, 24, 26, 6]
        : [38, 24, 30, 8];
      const pools: ViolationRow[][] = [LOW, MED, HIGH, CRIT];
      // wpick chooses the severity pool, pick() draws a violation inside it.
      let v = pick(wpick(pools, severityWeights));
      if (grade <= 5 && ELEMENTARY_BLOCKLIST.has(v.violation_type)) v = pick(LOW);
      return v;
    }

    // -------------------------------------------------------------------
    // 1) Idempotent cleanup of previously seeded DEMO rows (FK order).
    //    Demo rows = student_id BETWEEN 'S-2026-002' AND 'S-2026-601'.
    //    Jane Doe (S-2026-001) and incident 260912-001 are never touched.
    // -------------------------------------------------------------------
    const demoIds = `SELECT id FROM students WHERE student_id BETWEEN '${DEMO_ID_MIN}' AND '${DEMO_ID_MAX}'`;
    const demoIncidents = `SELECT id FROM incidents WHERE student_id IN (${demoIds})`;
    const del = async (label: string, sql: string): Promise<void> => {
      const r = await client.query(sql);
      console.log(`  cleanup: removed ${r.rowCount ?? 0} ${label}`);
    };
    console.log('Cleaning previously seeded demo rows (if any)…');
    await del('incident_status_logs', `DELETE FROM incident_status_logs WHERE incident_id IN (${demoIncidents})`);
    await del('parent_contacts', `DELETE FROM parent_contacts WHERE incident_id IN (${demoIncidents})`);
    await del('incident_evidence', `DELETE FROM incident_evidence WHERE incident_id IN (${demoIncidents})`);
    await del('mtss_interventions', `DELETE FROM mtss_interventions WHERE student_id IN (${demoIds}) OR incident_link IN (${demoIncidents})`);
    await del('incidents', `DELETE FROM incidents WHERE student_id IN (${demoIds})`);
    await del('students', `DELETE FROM students WHERE student_id BETWEEN '${DEMO_ID_MIN}' AND '${DEMO_ID_MAX}'`);

    // Existing per-day incident_id prefixes (e.g. 260912 already has -001) and the
    // full set of existing ids, so generated YYMMDD-NNN ids can never collide.
    const existing = await client.query(
      `SELECT split_part(incident_id, '-', 1) AS prefix, COUNT(*)::int AS n FROM incidents GROUP BY 1`);
    const existingPerDay = new Map<string, number>(
      existing.rows.map((r: { prefix: string; n: number }) => [r.prefix, r.n]));
    const existingIds = new Set<string>(
      (await client.query('SELECT incident_id FROM incidents')).rows.map((r: { incident_id: string }) => r.incident_id));
    console.log(`Existing incident_id prefixes: ${[...existingPerDay.entries()].map(([p, n]) => `${p}×${n}`).join(', ') || '(none)'}`);

    // -------------------------------------------------------------------
    // 2) Students
    // -------------------------------------------------------------------
    const gradeTotal = Object.values(GRADE_PLAN).reduce((s, n) => s + n, 0);
    if (gradeTotal !== DEMO_STUDENT_COUNT) throw new Error(`grade plan sums to ${gradeTotal}, expected ${DEMO_STUDENT_COUNT}`);

    // advisory labels per grade (a class roster feel: same few rooms per grade)
    const advisoryByGrade = new Map<number, string[]>();
    for (const g of Object.keys(GRADE_PLAN).map(Number)) {
      advisoryByGrade.set(g, shuffle([...TEACHERS]).slice(0, 6).map((t) => `Rm ${rint(1, 45)} - ${t}`));
    }

    const usedNames = new Set<string>(['jane doe']);
    const usedEmails = new Set<string>();
    const students: StudentSeed[] = [];
    let seq = 2; // S-2026-002 …
    for (const [grade, count] of Object.entries(GRADE_PLAN).map(([g, n]) => [Number(g), n] as [number, number])) {
      const advisories = advisoryByGrade.get(grade)!;
      for (let i = 0; i < count; i++) {
        let first = '', last = '', gender: 'M' | 'F' = 'F';
        for (let tries = 0; tries < 200; tries++) {
          gender = chance(0.5) ? 'F' : 'M';
          first = gender === 'F' ? pick(FEMALE_FIRSTS) : pick(MALE_FIRSTS);
          last = pick(LAST_NAMES);
          if (!usedNames.has(`${first} ${last}`.toLowerCase())) break;
        }
        usedNames.add(`${first} ${last}`.toLowerCase());

        const parentGender = chance(0.5) ? 'F' : 'M';
        const parentFirst = parentGender === 'F' ? pick(FEMALE_FIRSTS) : pick(MALE_FIRSTS);
        const parentLast = chance(0.85) ? last : pick(LAST_NAMES);
        let email = `${parentFirst}.${parentLast}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@example.com';
        if (usedEmails.has(email)) {
          // NOTE: keep digits in the sanitize regex — stripping them made the
          // numeric suffix vanish and this loop spin forever.
          let k = 2;
          while (usedEmails.has(`${parentFirst}.${parentLast}${k}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@example.com')) k++;
          email = `${parentFirst}.${parentLast}${k}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@example.com';
        }
        usedEmails.add(email);

        const birthYear = 2026 - (grade + 5); // age ≈ grade + 5 in Sept 2026
        students.push({
          student_id: `S-2026-${String(seq).padStart(3, '0')}`,
          last_name: last,
          first_name: first,
          grade,
          section: chance(0.5) ? 'A' : 'B',
          house_team: pick(HOUSES),
          counselor: pick(COUNSELORS),
          advisory: pick(advisories),
          gpa: randGpa(),
          total_points: 100,
          conduct_status: 'Good',
          observations: chance(0.15) ? pick(OBSERVATION_BANK) : '',
          date_of_birth: `${birthYear}-${String(rint(1, 12)).padStart(2, '0')}-${String(rint(1, 28)).padStart(2, '0')}`,
          parent_name: `${parentFirst} ${parentLast}`,
          parent_phone: makePhone(),
          parent_email: email,
          gender,
        });
        seq++;
      }
    }
    console.log(`Generated ${students.length} demo students (S-2026-002 … S-2026-${String(seq - 1).padStart(3, '0')})`);

    // -------------------------------------------------------------------
    // 3) Incident cohorts per student
    // -------------------------------------------------------------------
    const eligible = students.map((_, i) => i).filter((i) => students[i].grade >= 1);
    const grade0 = students.map((_, i) => i).filter((i) => students[i].grade === 0);
    // Repeat offenders skew toward middle/high school.
    const weightOf = (i: number): number => (students[i].grade >= 9 ? 2.5 : students[i].grade >= 6 ? 2 : 1);

    function weightedSampleNoReplace(pool: number[], n: number): number[] {
      const items = [...pool];
      const chosen: number[] = [];
      for (let k = 0; k < n && items.length; k++) {
        const weights = items.map(weightOf);
        chosen.push(wpick(items, weights));
        items.splice(items.indexOf(chosen[chosen.length - 1]), 1);
      }
      return chosen;
    }

    const repeatIdx = weightedSampleNoReplace(eligible, COHORTS.repeatOffenders);
    const remaining = eligible.filter((i) => !repeatIdx.includes(i));
    const shuffledRemaining = shuffle(remaining);
    const twoIdx = shuffledRemaining.slice(0, COHORTS.twoIncidents);
    const oneIdx = shuffledRemaining.slice(COHORTS.twoIncidents, COHORTS.twoIncidents + COHORTS.oneIncident);
    const grade0Idx = shuffle(grade0).slice(0, COHORTS.grade0Singles);

    // incident counts: repeat offenders 3–7, adjusted to hit the exact target
    const incidentCounts = new Map<number, number>();
    for (const i of oneIdx) incidentCounts.set(i, 1);
    for (const i of twoIdx) incidentCounts.set(i, 2);
    for (const i of grade0Idx) incidentCounts.set(i, 1);
    const repeatCounts = repeatIdx.map(() => wpick([3, 4, 5, 6, 7], [6, 12, 20, 30, 34]));
    repeatIdx.forEach((i, k) => incidentCounts.set(i, repeatCounts[k]));

    let totalIncidents = [...incidentCounts.values()].reduce((s, n) => s + n, 0);
    // Adjust repeat offenders (within 3-7) until the total is exactly the target.
    let guard = 100_000;
    while (totalIncidents !== TOTAL_INCIDENT_TARGET && guard-- > 0) {
      const k = rint(0, repeatIdx.length - 1);
      const i = repeatIdx[k];
      const cur = incidentCounts.get(i)!;
      if (totalIncidents < TOTAL_INCIDENT_TARGET && cur < 7) { incidentCounts.set(i, cur + 1); totalIncidents++; }
      else if (totalIncidents > TOTAL_INCIDENT_TARGET && cur > 3) { incidentCounts.set(i, cur - 1); totalIncidents--; }
    }
    console.log(`Incident cohorts: 0-incident=${600 - incidentCounts.size}, 1=${oneIdx.length + grade0Idx.length}, 2=${twoIdx.length}, repeat(3-7)=${repeatIdx.length}; total incidents=${totalIncidents}`);

    // -------------------------------------------------------------------
    // 4) Dates
    // -------------------------------------------------------------------
    const bucketDays = DATE_BUCKETS.map((b) => {
      const [from, to] = b.range;
      const days = schoolDays(from, to);
      // Extra dates from overlapping buckets are harmless; dedupe by set per bucket.
      return { days, weight: b.weight, label: b.label };
    });
    const dayWeights = bucketDays.map((b) => {
      const w = new Map<string, number>();
      const per = b.weight / b.days.length;
      for (const d of b.days) w.set(d, (w.get(d) ?? 0) + per);
      return w;
    });
    const allDayWeights = new Map<string, number>();
    for (const w of dayWeights) for (const [d, wt] of w) allDayWeights.set(d, (allDayWeights.get(d) ?? 0) + wt);
    const dayList = [...allDayWeights.keys()];
    const dayWts = dayList.map((d) => allDayWeights.get(d)!);
    const drawDate = (): string => wpick(dayList, dayWts);

    // -------------------------------------------------------------------
    // 5) Build incidents (chronological per student for escalation)
    // -------------------------------------------------------------------
    const incidents: IncidentSeed[] = [];

    const buildIncident = (studentIdx: number, ordinal: number, date: string, forcedViolation?: ViolationRow): void => {
      const st = students[studentIdx];
      const v = forcedViolation ?? pickViolation(st.grade, ordinal);
      const status = statusFor(date);
      const consequence = consequenceFor(v, ordinal);
      const sanction = sanctionFor(consequence);
      const location = st.grade === 0 ? pick(['Classroom', 'Playground', 'Cafeteria'] as const) : pick(LOCATIONS);
      const time = randTime();

      let parent_contacted: 'Yes' | 'No' = 'No';
      let contact_date: string | null = null;
      let action_taken: string | null = null;
      let resolved_date: string | null = null;
      let follow_up_needed: 'Yes' | 'No' = 'No';
      let follow_up_date: string | null = null;

      if (status === 'Resolved') {
        parent_contacted = 'Yes';
        contact_date = chance(0.7) ? date : addDays(date, 1);
        action_taken = pick(ACTION_TAKEN_RESOLVED);
        resolved_date = clampISO(addDays(date, rint(1, 14)), date, TODAY);
        follow_up_needed = chance(0.1) ? 'Yes' : 'No';
        if (follow_up_needed === 'Yes') follow_up_date = clampISO(addDays(date, rint(5, 20)), date, TODAY);
      } else if (status === 'Pending') {
        if (chance(0.6)) { parent_contacted = 'Yes'; contact_date = chance(0.75) ? date : addDays(date, 1); }
        action_taken = chance(0.7) ? pick(ACTION_TAKEN_PENDING) : null;
        if (chance(0.4)) {
          follow_up_needed = 'Yes';
          follow_up_date = clampISO(addDays(TODAY, rint(-7, 14)), date, addDays(TODAY, 14));
        }
      } else { // Open
        if (chance(0.15)) { parent_contacted = 'Yes'; contact_date = date; }
        action_taken = chance(0.35) ? 'Pending investigation.' : null;
        if (chance(0.35)) { follow_up_needed = 'Yes'; follow_up_date = addDays(TODAY, rint(1, 14)); }
      }

      const isCritical = v.severity === 'Critical';
      const escalated = consequence === 'Expulsion' || (isCritical && chance(0.4));
      const witnessesRoll = rand();
      const witnesses = witnessesRoll < 0.60 ? null
        : witnessesRoll < 0.85 ? `Yes - ${rint(1, 4)} student${chance(0.7) ? 's' : ''}`
        : `${pick(TEACHERS)} (teacher)`;

      incidents.push({
        studentIdx, date, time, violation: v, ordinal, location,
        description: pick(DESCRIPTION_TEMPLATES).replace('{v}', v.violation_type).replace('{loc}', location),
        witnesses, parent_contacted, contact_date, action_taken, consequence,
        points_deducted: v.points_deduction,
        ...sanction,
        referral_date: (v.severity === 'Medium' || v.severity === 'High' || v.severity === 'Critical') && chance(0.3) ? date : null,
        administrator_id: 1,
        notes: chance(0.4) ? pick(NOTES_BANK) : null,
        follow_up_needed, follow_up_date,
        status, resolved_date,
        reported_by: chance(0.85) ? pick(TEACHERS) : null,
        escalated_to_principal: escalated,
        principal_notified_at: escalated ? (chance(0.7) ? date : addDays(date, 1)) : null,
        created_at: `${date} ${time}:00`,
        advisor: st.counselor,
        incident_id: '', // assigned below
      });
    };

    // Re-date an incident while keeping derived fields consistent (never resolve,
    // contact or follow up before the incident itself happened).
    const redate = (inc: IncidentSeed, newDate: string): void => {
      inc.date = newDate;
      inc.created_at = `${newDate} ${inc.time}:00`;
      if (inc.resolved_date && inc.resolved_date < newDate) inc.resolved_date = newDate;
      if (inc.contact_date && inc.contact_date < newDate) inc.contact_date = newDate;
      if (inc.principal_notified_at && inc.principal_notified_at < newDate) inc.principal_notified_at = newDate;
      if (inc.referral_date && inc.referral_date < newDate) inc.referral_date = newDate;
      if (inc.follow_up_date && inc.follow_up_date < newDate) {
        inc.follow_up_date = clampISO(addDays(newDate, rint(1, 10)), newDate, addDays(TODAY, 14));
      }
    };

    for (const [idx, n] of incidentCounts) {
      const dates: string[] = [];
      for (let k = 0; k < n; k++) dates.push(drawDate());
      dates.sort(); // chronological → escalation reads naturally
      const forced = students[idx].grade === 0
        ? violations.find((v) => v.violation_type === 'Classroom Disruption')
          ?? violations.find((v) => v.violation_type === 'Tardy to Class')
        : undefined;
      dates.forEach((d, k) => buildIncident(idx, k + 1, d, forced));
    }

    // Force exactly 4 incidents dated TODAY (existing 260912-001 → ours start at -002)
    // and make sure 09-10 / 09-11 each carry several incidents. Dates only move
    // within the last 30 days, so per-student chronology/escalation stays believable.
    const todayTargets = shuffle(incidents.filter((x) => daysBetween(x.date, TODAY) <= 30)).slice(0, 4);
    for (const inc of todayTargets) redate(inc, TODAY);
    for (const want of ['2026-09-10', '2026-09-11']) {
      let have = incidents.filter((x) => x.date === want).length;
      const spares = shuffle(incidents.filter((x) => x.date >= '2026-08-13' && x.date <= '2026-09-09'));
      for (const inc of spares) {
        if (have >= 5) break;
        redate(inc, want); have++;
      }
    }

    // -------------------------------------------------------------------
    // 6) Assign incident_id = YYMMDD-NNN per day, after existing counts
    // -------------------------------------------------------------------
    const byDay = new Map<string, IncidentSeed[]>();
    for (const inc of incidents) {
      const prefix = inc.date.replace(/-/g, '').slice(2);
      if (!byDay.has(prefix)) byDay.set(prefix, []);
      byDay.get(prefix)!.push(inc);
    }
    const seenIds = new Set<string>();
    for (const [prefix, group] of byDay) {
      group.sort((a, b) =>
        `${a.time} ${students[a.studentIdx].student_id}`.localeCompare(`${b.time} ${students[b.studentIdx].student_id}`));
      let n = (existingPerDay.get(prefix) ?? 0) + 1;
      for (const inc of group) {
        let id = `${prefix}-${String(n).padStart(3, '0')}`;
        while (seenIds.has(id) || existingIds.has(id)) { n++; id = `${prefix}-${String(n).padStart(3, '0')}`; }
        seenIds.add(id);
        inc.incident_id = id;
        n++;
      }
    }
    if (seenIds.size !== incidents.length) throw new Error('incident_id collision during generation');

    // Sanity check: no malformed incidents (bad violation refs) reach the DB.
    for (const inc of incidents) {
      if (inc.violation?.id == null || inc.violation?.points_deduction == null || inc.violation?.violation_type == null || inc.description.includes('undefined')) {
        throw new Error(`malformed incident generated for ${students[inc.studentIdx].student_id}: violation=${JSON.stringify(inc.violation)}`);
      }
    }

    // -------------------------------------------------------------------
    // 7) Insert students → incidents → recompute points → MTSS → parent contacts
    // -------------------------------------------------------------------
    const STUDENT_COLUMNS = [
      'student_id', 'last_name', 'first_name', 'grade', 'section', 'house_team', 'counselor',
      'advisory', 'gpa', 'total_points', 'conduct_status', 'observations', 'date_of_birth',
      'parent_name', 'parent_phone', 'parent_email', 'gender',
    ] as const;
    const studentRows = await insertBatch(client, 'students', STUDENT_COLUMNS, students as unknown as Record<string, unknown>[], {
      returning: 'id, student_id', chunkSize: 100,
    });
    const studentDbId = new Map<string, number>(); // student_id text → db id
    for (const r of studentRows) studentDbId.set(String(r.student_id), Number(r.id));
    console.log(`Inserted ${studentRows.length} students`);

    const INCIDENT_COLUMNS = [
      'incident_id', 'date', 'time', 'student_id', 'violation_id', 'location', 'description',
      'witnesses', 'parent_contacted', 'contact_date', 'action_taken', 'consequence',
      'points_deducted', 'days_iss', 'days_oss', 'detention_hours', 'referral_date',
      'administrator_id', 'notes', 'follow_up_needed', 'follow_up_date', 'status',
      'resolved_date', 'reported_by', 'escalated_to_principal', 'principal_notified_at',
      'created_at', 'advisor',
    ] as const;
    const incidentPayloads = incidents.map((inc) => ({
      ...inc,
      student_id: studentDbId.get(students[inc.studentIdx].student_id)!,
      violation_id: inc.violation.id,
    }));
    const incidentRows = await insertBatch(client, 'incidents', INCIDENT_COLUMNS, incidentPayloads as unknown as Record<string, unknown>[], {
      returning: 'id, incident_id, student_id, status', chunkSize: 60,
    });
    console.log(`Inserted ${incidentRows.length} incidents`);

    // incident db ids per student (for MTSS incident_link + parent_contacts)
    const incidentsByStudent = new Map<number, { id: number; status: string }[]>();
    for (const r of incidentRows) {
      const sid = Number(r.student_id);
      if (!incidentsByStudent.has(sid)) incidentsByStudent.set(sid, []);
      incidentsByStudent.get(sid)!.push({ id: Number(r.id), status: String(r.status) });
    }

    // Recompute total_points + conduct_status for DEMO students only.
    const pointsRes = await client.query(`
      WITH agg AS (
        SELECT student_id, SUM(points_deducted)::int AS pts FROM incidents GROUP BY student_id
      )
      UPDATE students s
      SET total_points = GREATEST(0, 100 + COALESCE(a.pts, 0)),
          conduct_status = CASE
            WHEN GREATEST(0, 100 + COALESCE(a.pts, 0)) >= 80 THEN 'Good'
            WHEN GREATEST(0, 100 + COALESCE(a.pts, 0)) >= 60 THEN 'Warning'
            ELSE 'Probation' END
      FROM agg a
      WHERE a.student_id = s.id
        AND s.student_id BETWEEN '${DEMO_ID_MIN}' AND '${DEMO_ID_MAX}'
      RETURNING s.id`);
    console.log(`Recomputed total_points/conduct_status for ${pointsRes.rowCount} demo students`);

    // -------------------------------------------------------------------
    // 8) MTSS interventions (~75), tiered by incident count
    // -------------------------------------------------------------------
    const incidentCountByStudent = new Map<number, number>();
    for (const [sid, list] of incidentsByStudent) incidentCountByStudent.set(sid, list.length);
    const dbIdToIdx = new Map<number, number>(); // db id → students[] index
    for (const [idx, st] of students.entries()) dbIdToIdx.set(studentDbId.get(st.student_id)!, idx);

    const poolBy = (lo: number, hi: number, exclude: Set<number>): number[] =>
      [...incidentCountByStudent.entries()]
        .filter(([sid, n]) => n >= lo && n <= hi && !exclude.has(sid))
        .map(([sid]) => sid);

    const usedMtss = new Set<number>();
    const mtss: MtssSeed[] = [];
    // Exact progress quotas: ~15% Not Started / ~55% In Progress / ~30% Completed.
    const progressQueue = shuffle([
      ...Array<MtssSeed['progress']>(11).fill('Not Started'),
      ...Array<MtssSeed['progress']>(41).fill('In Progress'),
      ...Array<MtssSeed['progress']>(23).fill('Completed'),
    ]);
    const tierPlan: { tier: 1 | 2 | 3; count: number; lo: number; hi: number }[] = [
      { tier: 1, count: 30, lo: 2, hi: 3 },
      { tier: 2, count: 25, lo: 4, hi: 5 },
      { tier: 3, count: 20, lo: 6, hi: 7 },
    ];
    for (const plan of tierPlan) {
      let pool = shuffle(poolBy(plan.lo, plan.hi, usedMtss));
      if (pool.length < plan.count) { // backfill from adjacent bands
        const extra = shuffle(poolBy(plan.lo - 1, plan.hi + 2, usedMtss));
        pool = pool.concat(extra);
      }
      for (const sid of pool.slice(0, plan.count)) {
        usedMtss.add(sid);
        const idx = dbIdToIdx.get(sid)!;
        const st = students[idx];

        const progress: MtssSeed['progress'] = progressQueue.shift() ?? 'In Progress';
        // Completed needs room for an end_date ≤ today.
        const startMax = progress === 'Completed' ? '2026-06-10'
          : progress === 'Not Started' ? TODAY
          : '2026-08-25';
        const startMin = '2026-03-12';
        let start_date = clampISO(
          addDays(startMin, rint(0, Math.max(0, daysBetween(startMin, startMax)))), startMin, startMax);
        if (!isSchoolDay(start_date)) start_date = addDays(start_date, dow(start_date) === 6 ? 2 : 1);
        const end_date = progress === 'Completed'
          ? clampISO(addDays(start_date, rint(30, 80)), start_date, TODAY) : null;
        const review_date = clampISO(addDays(start_date, rint(14, 42)), start_date, '2026-10-15');

        let tier_history: unknown = [];
        if (progress === 'Completed' && plan.tier > 1 && chance(0.6)) {
          tier_history = [{
            from_tier: plan.tier - 1, to_tier: plan.tier,
            date: clampISO(addDays(start_date, rint(3, 25)), start_date, end_date ?? TODAY),
            reason: pick(TIER_CHANGE_REASONS),
          }];
        } else if (progress === 'Completed' && plan.tier === 1 && chance(0.35)) {
          tier_history = [{
            from_tier: 2, to_tier: 1,
            date: clampISO(addDays(start_date, rint(10, 40)), start_date, end_date ?? TODAY),
            reason: 'Successful step-down after meeting exit criteria.',
          }];
        }

        const studentIncidents = incidentsByStudent.get(sid) ?? [];
        mtss.push({
          studentIdx: idx,
          tier: plan.tier,
          intervention: pick(MTSS_INTERVENTIONS[plan.tier]),
          start_date, end_date, progress,
          notes: chance(0.6) ? pick(MTSS_NOTES) : null,
          intervention_goal: pick(MTSS_GOALS),
          progress_monitoring: pick(MTSS_MONITORING),
          review_date,
          exit_criteria: pick(MTSS_EXIT_CRITERIA),
          incident_link: studentIncidents.length && chance(0.4) ? pick(studentIncidents).id : null,
          advisor: st.counselor,
          tier_history,
        });
      }
    }

    const MTSS_COLUMNS = [
      'student_id', 'tier', 'intervention', 'start_date', 'end_date', 'progress', 'notes',
      'intervention_goal', 'progress_monitoring', 'review_date', 'exit_criteria',
      'incident_link', 'advisor', 'tier_history',
    ] as const;
    const mtssPayloads = mtss.map((m) => ({
      ...m,
      student_id: studentDbId.get(students[m.studentIdx].student_id)!,
      tier_history: JSON.stringify(m.tier_history),
    }));
    await insertBatch(client, 'mtss_interventions', MTSS_COLUMNS, mtssPayloads as unknown as Record<string, unknown>[], {
      returning: 'id', chunkSize: 100,
    });
    console.log(`Inserted ${mtssPayloads.length} MTSS interventions`);

    // -------------------------------------------------------------------
    // 9) parent_contacts — one row for ~30% of Resolved incidents
    // -------------------------------------------------------------------
    const seedByIncidentId = new Map<string, IncidentSeed>(incidents.map((i) => [i.incident_id, i]));
    const parentContacts: ParentContactSeed[] = [];
    for (const r of incidentRows) {
      if (String(r.status) !== 'Resolved' || !chance(0.3)) continue;
      const sid = Number(r.student_id);
      const st = students[dbIdToIdx.get(sid)!];
      const seed = seedByIncidentId.get(String(r.incident_id))!;
      parentContacts.push({
        incidentDbId: Number(r.id),
        contact_date: clampISO(addDays(seed.date, chance(0.7) ? 0 : 1), seed.date, TODAY),
        contact_method: wpick(['Phone', 'Email', 'In Person'] as const, [55, 25, 20]),
        parent_name: st.parent_name,
        notes: pick(PARENT_CONTACT_NOTES),
        follow_up_required: 'No',
      });
    }
    if (parentContacts.length) {
      const pcPayloads = parentContacts.map((pc) => ({ ...pc, incident_id: pc.incidentDbId }));
      await insertBatch(client, 'parent_contacts',
        ['incident_id', 'contact_date', 'contact_method', 'parent_name', 'notes', 'follow_up_required'] as const,
        pcPayloads as unknown as Record<string, unknown>[], { returning: 'id', chunkSize: 100 });
    }
    console.log(`Inserted ${parentContacts.length} parent contact records`);

    await client.query('COMMIT');
    console.log('\n✅ Seed committed. Running verification…\n');

    // -------------------------------------------------------------------
    // 10) Verification
    // -------------------------------------------------------------------
    const show = (title: string, rows: Record<string, unknown>[]): void => {
      console.log(`— ${title}`);
      if (rows.length) console.table(rows); else console.log('   (no rows)');
    };

    const q = async (sql: string): Promise<Record<string, unknown>[]> => (await client.query(sql)).rows as Record<string, unknown>[];

    show('Students (total / demo / preserved Jane Doe)', await q(`
      SELECT COUNT(*)::int AS total_students,
             COUNT(*) FILTER (WHERE student_id BETWEEN '${DEMO_ID_MIN}' AND '${DEMO_ID_MAX}')::int AS demo_students,
             COUNT(*) FILTER (WHERE student_id = 'S-2026-001')::int AS jane_doe
      FROM students`));

    show('Grade distribution', await q(`
      SELECT grade, COUNT(*)::int AS n FROM students GROUP BY grade ORDER BY grade`));

    show('Incidents (count + status breakdown)', await q(`
      SELECT status, COUNT(*)::int AS n, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
      FROM incidents GROUP BY status ORDER BY status`));

    show('Incidents per student (repeat offenders 3+)', await q(`
      SELECT n_incidents, COUNT(*)::int AS students FROM (
        SELECT s.id, COUNT(i.id)::int AS n_incidents
        FROM students s LEFT JOIN incidents i ON i.student_id = s.id
        GROUP BY s.id) t
      GROUP BY n_incidents ORDER BY n_incidents`));

    show('MTSS by tier', await q(`
      SELECT tier, COUNT(*)::int AS n FROM mtss_interventions GROUP BY tier ORDER BY tier`));
    show('MTSS by progress', await q(`
      SELECT progress, COUNT(*)::int AS n FROM mtss_interventions GROUP BY progress ORDER BY progress`));

    show('Per-day incident_id uniqueness violations (MUST be empty)', await q(`
      SELECT split_part(incident_id, '-', 1) AS day_prefix, COUNT(*)::int AS ids, COUNT(DISTINCT incident_id)::int AS distinct_ids
      FROM incidents GROUP BY 1 HAVING COUNT(*) <> COUNT(DISTINCT incident_id)`));

    show('Conduct status distribution', await q(`
      SELECT conduct_status, COUNT(*)::int AS n FROM students GROUP BY conduct_status ORDER BY conduct_status`));

    show('Incident date range + freshness', await q(`
      SELECT MIN(date) AS min_date, MAX(date) AS max_date,
             COUNT(*) FILTER (WHERE date > '${TODAY}')::int AS future_dates,
             COUNT(*) FILTER (WHERE date >= '2026-09-06')::int AS last_7_days,
             COUNT(*) FILTER (WHERE date >= '2026-08-13')::int AS last_30_days
      FROM incidents`));

    show('Weekend/summer incidents (only 2026-09-12 allowed)', await q(`
      SELECT date, COUNT(*)::int AS n FROM incidents
      WHERE (EXTRACT(ISODOW FROM date::date) IN (6, 7) AND date <> '${TODAY}')
         OR date BETWEEN '2026-06-15' AND '2026-08-10'
      GROUP BY date ORDER BY date`));

    show(`Incidents dated ${TODAY} (must start at 260912-002)`, await q(`
      SELECT incident_id, status, consequence, points_deducted FROM incidents
      WHERE date = '${TODAY}' ORDER BY incident_id`));

    show('FK orphan checks (all must be zero)', await q(`
      SELECT
        (SELECT COUNT(*) FROM incidents i LEFT JOIN students s ON s.id = i.student_id WHERE s.id IS NULL)::int AS orphan_incidents,
        (SELECT COUNT(*) FROM incidents i LEFT JOIN violations v ON v.id = i.violation_id WHERE v.id IS NULL)::int AS orphan_violations,
        (SELECT COUNT(*) FROM mtss_interventions m LEFT JOIN incidents i ON i.id = m.incident_link WHERE m.incident_link IS NOT NULL AND i.id IS NULL)::int AS orphan_mtss_links,
        (SELECT COUNT(*) FROM parent_contacts p LEFT JOIN incidents i ON i.id = p.incident_id WHERE i.id IS NULL)::int AS orphan_parent_contacts,
        (SELECT COUNT(*) FROM parent_contacts)::int AS parent_contact_rows`));

    show('Top violation types used', await q(`
      SELECT v.violation_type, v.severity, COUNT(*)::int AS n FROM incidents i
      JOIN violations v ON v.id = i.violation_id GROUP BY 1, 2 ORDER BY n DESC LIMIT 8`));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().then(() => {
  console.log('\nDone. Demo data is ready — log in as admin and explore Students / Incidents / MTSS / Reports.');
  process.exitCode = 0;
}).catch((err) => {
  console.error('\n❌ Seed failed (transaction rolled back, database unchanged):', err);
  process.exitCode = 1;
});
