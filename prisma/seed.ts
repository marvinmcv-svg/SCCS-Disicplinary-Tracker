#!/usr/bin/env bun
/**
 * prisma/seed.ts — SCCS Discipline Tracker seed (Prisma + SQLite port).
 *
 * Ports two sources into one idempotent script:
 *   1. sccs/server/db.ts        → the 22 violations, 3 alerts, 4 settings, the env-declared
 *                                 admin (admin/admin123), the 8 test accounts (principal /
 *                                 staff / parent / parent2 / pendingparent / student /
 *                                 counselor / teacher), the 24 advisor accounts and the
 *                                 parent↔student link reconciliation.
 *   2. sccs/scripts/seed-demo-data.ts → the deterministic 600-student / ~900-incident /
 *                                 ~75-MTSS demo dataset (mulberry32 PRNG, seed 20260912,
 *                                 same call order), with every date generated RELATIVE TO
 *                                 TODAY so the dashboard's "today / this week / this month"
 *                                 filters always have data.
 *
 * Idempotency:
 *   - violations / alerts   : skipped entirely once seeded (never touched again).
 *   - settings              : upserted per key.
 *   - admin                 : created if missing (with a password_history row); if present
 *                             it is kept exactly as-is (never re-hashed).
 *   - test / advisor accounts: created per-username; existing usernames are skipped.
 *   - demo rows             : students S-2026-002 … S-2026-601 plus their incidents (and the
 *                             incidents' status logs / evidence / parent contacts), MTSS rows
 *                             and parent_student_links are deleted first, then regenerated
 *                             deterministically (same PRNG → same students every run).
 *
 * SQLite + Prisma notes:
 *   - createMany() is not supported on SQLite, so bulk inserts use create() inside chunked
 *     $transaction batches (600 students / ~900 incidents / 75 MTSS / ~130 parent contacts).
 *   - The original pg schema cascaded parent_student_links when demo students were deleted;
 *     the Prisma port has no FK there, so the seed deletes those links explicitly.
 *
 * Run:
 *   bun run db:seed        (or: bun prisma/seed.ts)
 * The database path comes from prisma/schema.prisma (single source of truth).
 */

import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViolationLite {
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
  violation: ViolationLite;
  ordinal: number;               // 1st/2nd/3rd… incident for that student (escalation)
  location: string;
  description: string;
  witnesses: string | null;
  parent_contacted: 'Yes' | 'No';
  contact_date: string | null;
  action_taken: string | null;
  consequence: string | null;
  penalty: string | null;         // PlusPortals penalty code value ("DET — Detention")
  penalty_served: string | null;  // PlusPortals served-status code value ("SRVD — Served")
  points_deducted: number;
  days_iss: number;
  days_oss: number;
  detention_hours: number;
  referral_date: string | null;
  administrator_id: number | null;
  notes: string | null;
  follow_up_needed: 'Yes' | 'No';
  follow_up_date: string | null;
  status: 'Open' | 'Pending' | 'Resolved';
  resolved_date: string | null;
  reported_by: string | null;
  escalated_to_principal: boolean;
  principal_notified_at: string | null;
  created_at: string;            // 'YYYY-MM-DD HH:MM:SS'
  advisor: string | null;        // student's counselor — kept for parity; the Prisma port of
                                 // the incidents table has no advisor column, so it is NOT
                                 // persisted (deviation noted in the worklog).
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
  incident_link: number | null;  // incidents.id, set after insert
  advisor: string;
  tier_history: unknown;         // JSON text
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
// Date helpers (all UTC, ISO 'YYYY-MM-DD' text like the app itself uses).
// The original demo script used a fixed sandbox date (2026-09-12); this port
// anchors every range to the REAL today so 'today / this week' filters have
// data whenever the seed runs.
// ---------------------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10);
const DAY_MS = 86_400_000;
const toUtc = (iso: string): Date => new Date(iso + 'T00:00:00Z');
const fmt = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string => fmt(new Date(toUtc(iso).getTime() + n * DAY_MS));
const daysBetween = (a: string, b: string): number => Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
const dow = (iso: string): number => toUtc(iso).getUTCDay(); // 0=Sun … 6=Sat
const isWeekend = (iso: string): boolean => dow(iso) === 0 || dow(iso) === 6;
// Summer break window, relative to today (original: 2026-06-15 … 2026-08-10 with
// TODAY = 2026-09-12 → −89 … −33 days).
const SUMMER_START = addDays(TODAY, -89);
const SUMMER_END = addDays(TODAY, -33);
const inSummer = (iso: string): boolean => iso >= SUMMER_START && iso <= SUMMER_END;
const isSchoolDay = (iso: string): boolean => !isWeekend(iso) && !inSummer(iso);
const clampISO = (iso: string, lo: string, hi: string): string => (iso < lo ? lo : iso > hi ? hi : iso);

function schoolDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isSchoolDay(d)) out.push(d);
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Static banks (staff / template text) — verbatim from seed-demo-data.ts
// ---------------------------------------------------------------------------

// Staff names below are the app's OWN hardcoded staff list (allAdvisors in
// client/src/pages/MTSS.tsx) — using them keeps the demo data consistent with
// the MTSS advisor filter and the incident "Assigned To" column.
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
// PlusPortals SIS location codes (see PP_LOCATION_CODES) — the demo dataset
// records referrals with the same coded locations staff pick in the app.
const LOCATIONS = [
  'CLS — Classroom', 'HALL — Hallway', 'CAFE — Cafeteria', 'PLAY — Playground',
  'GYM — Gymnasium', 'REST — Restroom', 'LIB — Library', 'BUS — School Bus',
  'GRDS — Campus Grounds', 'PARK — Parking Lot',
] as const;
const LOCATIONS_EARLY = ['CLS — Classroom', 'PLAY — Playground', 'CAFE — Cafeteria'] as const;

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
// The 9-12 group is adjusted (31/31/31/32) to make the sum exactly 600.
const GRADE_PLAN: Record<number, number> = {
  0: 20, 1: 55, 2: 55, 3: 55, 4: 55, 5: 55,
  6: 60, 7: 60, 8: 60,
  9: 31, 10: 31, 11: 31, 12: 32,
};

const TOTAL_INCIDENT_TARGET = 900;

// Incident-count cohorts: ~25% one incident, ~12% two, repeat offenders (3-7
// incidents) scaled so the total reaches ~900.
const COHORTS = {
  grade0Singles: 2,     // at most 1-2 incidents in Pre-K/K
  oneIncident: 150,     // 25%
  twoIncidents: 72,     // 12%
  repeatOffenders: 100, // 3-7 incidents each (Repeat Offender alert fires at 3+)
};

// Calendar buckets (percent of all incidents), anchored to TODAY. The original
// ran with TODAY = 2026-09-12, so each bucket below is the same span expressed
// as a day offset from today:
//   A  last 7 days          [-6,  0]
//   B  last 30 days (excl A)[-30, -7]
//   C  session start        [-32, -31]
//   D  late spring          [-134, -90]
//   E  winter/spring        [-285, -135]
const DATE_BUCKETS: { range: [string, string]; weight: number; label: string }[] = [
  { range: [addDays(TODAY, -6), TODAY], weight: 0.08, label: 'last 7 days' },
  { range: [addDays(TODAY, -30), addDays(TODAY, -7)], weight: 0.22, label: 'last 30 days (excl. A)' },
  { range: [addDays(TODAY, -32), addDays(TODAY, -31)], weight: 0.02, label: 'session start' },
  { range: [addDays(TODAY, -134), addDays(TODAY, -90)], weight: 0.33, label: 'late spring' },
  { range: [addDays(TODAY, -285), addDays(TODAY, -135)], weight: 0.35, label: 'winter/spring' },
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

function consequenceFor(v: ViolationLite, ordinal: number): string {
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

// Map a plain-text consequence onto the matching PlusPortals penalty code
// (pure — no PRNG calls, so the deterministic demo stream is unchanged).
function penaltyFor(consequence: string | null): string | null {
  if (!consequence) return null;
  if (consequence === 'Warning') return 'WARN — Warning';
  if (consequence === 'Zero') return 'GRZ — Grade of Zero';
  if (consequence === 'Detention') return 'DET — Detention';
  if (consequence === 'Double Detention') return 'DDET — Double Detention';
  if (consequence === 'Saturday School') return 'SAT — Saturday School';
  if (consequence === 'ISS') return 'ISS — In-School Suspension';
  if (consequence === 'OSS' || consequence === '3-Day OSS' || consequence === '5-Day OSS' || consequence === 'Extended OSS') {
    return 'OSS — Out-of-School Suspension';
  }
  if (consequence === 'Expulsion' || consequence === 'Expulsion Referral') return 'EXPUL — Expulsion Referral';
  if (consequence === 'Legal Referral') return 'POLR — Police/Legal Referral';
  return null; // e.g. 'OSS + Restitution', custom text → no SIS code match
}

// Served status for the assigned penalty, derived deterministically from the
// incident's own state (NO PRNG — keeps the demo stream byte-stable).
function servedFor(penalty: string | null, status: 'Open' | 'Pending' | 'Resolved', ordinal: number): string | null {
  if (!penalty || penalty === 'NONE — No Penalty') return null;
  if (status === 'Resolved') {
    if (ordinal % 5 === 0) return 'PSRVD — Partially Served';
    if (ordinal % 7 === 0) return 'RESCH — Rescheduled';
    return 'SRVD — Served';
  }
  return 'PEND — Pending';
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
// Reference data: violations / alerts / settings (ported from sccs/server/db.ts)
// ---------------------------------------------------------------------------

// violations: [category, violation_type, description, points, consequence, min_oss, max_oss, severity, mandatory_parent, mandatory_admin, progressive_consequences]
const VIOLATIONS: [string, string, string, number, string, number, number, string, boolean, boolean, [string, string][]][] = [
  // Attendance - Low severity
  ['Attendance', 'Tardy to School', 'Arriving late to school without proper excuse', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['3rd', 'Detention'], ['5th', 'Saturday School']]],
  ['Attendance', 'Tardy to Class', 'Arriving late to class without a pass', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['3rd', 'Detention']]],
  ['Attendance', 'Unexcused Absence', 'Missing school without parent notification', -3, 'Detention', 0, 1, 'Medium', true, false, [['1st', 'Detention'], ['2nd', 'Saturday School'], ['3rd', 'ISS']]],
  ['Attendance', 'Class Cut/AWOL', 'Skipping class or leaving school', -5, 'Saturday School', 0, 2, 'Medium', true, false, [['1st', 'Saturday School'], ['2nd', 'ISS'], ['3rd', 'OSS']]],
  // Classroom Behavior - varies
  ['Classroom Behavior', 'Classroom Disruption', 'Behavior that interrupts learning', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Detention'], ['3rd', 'ISS']]],
  ['Classroom Behavior', 'Insubordination', 'Refusing to comply with staff requests', -3, 'Detention', 0, 1, 'Medium', false, false, [['1st', 'Detention'], ['2nd', 'ISS'], ['3rd', 'OSS']]],
  ['Classroom Behavior', 'Defiant Behavior', 'Openly defying authority', -3, 'ISS', 0, 3, 'High', true, true, [['1st', 'ISS'], ['2nd', 'OSS']]],
  ['Classroom Behavior', 'Inappropriate Language', 'Using profanity or vulgar language', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Detention']]],
  // Physical Behavior - High severity
  ['Physical Behavior', 'Physical Altercation', 'Getting into physical confrontation', -5, 'OSS', 1, 3, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Extended OSS']]],
  ['Physical Behavior', 'Fighting', 'Engaging in physical combat', -10, 'OSS', 3, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Expulsion Referral']]],
  // Academic Integrity
  ['Academic Integrity', 'Cheating', 'Academic dishonesty on tests/assignments', -5, 'Zero', 0, 1, 'Medium', true, false, [['1st', 'Zero'], ['2nd', 'ISS']]],
  ['Academic Integrity', 'Plagiarism', 'Using work without proper citation', -5, 'Zero', 0, 0, 'Medium', true, false, [['1st', 'Zero'], ['2nd', 'ISS']]],
  // Dress Code - Low
  ['Dress Code', 'Dress Code Violation', 'Not adhering to school dress code', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Parent Contact']]],
  // Tobacco/Alcohol/Drugs - High
  ['Tobacco/Alcohol/Drugs', 'Tobacco Possession', 'Possessing tobacco on campus', -5, '3-Day OSS', 3, 3, 'High', true, true, [['1st', '3-Day OSS'], ['2nd', '5-Day OSS']]],
  ['Tobacco/Alcohol/Drugs', 'Vaping', 'Using e-cigarettes on campus', -5, '3-Day OSS', 3, 3, 'High', true, true, [['1st', '3-Day OSS'], ['2nd', '5-Day OSS']]],
  // Bullying/Harassment - High/Critical
  ['Bullying/Harassment', 'Bullying', 'Intimidating or harassing behavior', -5, 'OSS', 3, 5, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Extended OSS']]],
  ['Bullying/Harassment', 'Threats', 'Threatening to harm others', -10, 'OSS', 5, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Expulsion Referral']]],
  // Weapons - Critical
  ['Weapons', 'Weapons Possession', 'Possessing weapons on campus', -25, 'Expulsion', 99, 99, 'Critical', true, true, [['1st', 'Expulsion']]],
  // Property
  ['Property', 'Theft', 'Stealing property', -10, 'OSS', 0, 5, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Legal Referral']]],
  ['Property', 'Vandalism', 'Deliberately damaging property', -10, 'OSS', 0, 5, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Restitution']]],
  // Technology - Low
  ['Technology', 'AUP Violation', 'Violating technology use policy', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Suspension of Tech Privileges']]],
  // Safety - High
  ['Safety', 'Fire Alarm Misuse', 'Pulling fire alarm without cause', -5, 'OSS', 1, 3, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Legal Referral']]],
];

// PlusPortals (Rediker SIS) discipline codes — the short codes used when logging
// discipline referrals in PlusPortals, mapped onto this tracker's violation
// catalog so a referral can be registered here under the SAME code the school
// uses in the SIS. violation_type is "CODE — Name" so both the code and the
// plain-language name are displayed and searchable in the incident form.
// Category is 'PlusPortals'. Admins can retune points/consequences of any code
// from the Violations page (this seeder never touches existing rows).
const PLUSPORTALS_VIOLATIONS: [string, string, string, number, string, number, number, string, boolean, boolean, [string, string][]][] = [
  // Attendance
  ['PlusPortals', 'TARDY — Tardy to School', 'Arriving late to school (PlusPortals code TARDY)', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['3rd', 'Detention'], ['5th', 'Saturday School']]],
  ['PlusPortals', 'TARDYC — Tardy to Class', 'Arriving late to class without a pass (PlusPortals code TARDYC)', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['3rd', 'Detention']]],
  ['PlusPortals', 'UNXABS — Unexcused Absence', 'Absent without parent/doctor note (PlusPortals code UNXABS)', -3, 'Detention', 0, 1, 'Medium', true, false, [['1st', 'Detention'], ['2nd', 'Saturday School'], ['3rd', 'ISS']]],
  ['PlusPortals', 'CUTC — Class Cut', 'Skipping an assigned class (PlusPortals code CUTC)', -5, 'Saturday School', 0, 2, 'Medium', true, false, [['1st', 'Saturday School'], ['2nd', 'ISS'], ['3rd', 'OSS']]],
  ['PlusPortals', 'AWOL — Left Campus Without Permission', 'Leaving campus without sign-out (PlusPortals code AWOL)', -5, 'ISS', 0, 3, 'High', true, true, [['1st', 'ISS'], ['2nd', 'OSS']]],
  // Classroom behavior
  ['PlusPortals', 'DISRUPT — Classroom Disruption', 'Behavior that interrupts instruction (PlusPortals code DISRUPT)', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Detention'], ['3rd', 'ISS']]],
  ['PlusPortals', 'DISRES — Disrespect to Staff/Peer', 'Rude or disrespectful conduct (PlusPortals code DISRES)', -3, 'Detention', 0, 1, 'Medium', false, false, [['1st', 'Detention'], ['2nd', 'ISS'], ['3rd', 'OSS']]],
  ['PlusPortals', 'INSUB — Insubordination', 'Refusing to follow staff direction (PlusPortals code INSUB)', -3, 'Detention', 0, 1, 'Medium', false, false, [['1st', 'Detention'], ['2nd', 'ISS'], ['3rd', 'OSS']]],
  ['PlusPortals', 'DEFIANCE — Defiance of Authority', 'Open defiance of authority (PlusPortals code DEFIANCE)', -3, 'ISS', 0, 3, 'High', true, true, [['1st', 'ISS'], ['2nd', 'OSS']]],
  ['PlusPortals', 'PROFAN — Profanity/Inappropriate Language', 'Profane or vulgar language (PlusPortals code PROFAN)', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Detention']]],
  ['PlusPortals', 'UNPREP — Unprepared for Class', 'Missing materials/homework (PlusPortals code UNPREP)', -1, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['3rd', 'Detention']]],
  ['PlusPortals', 'FOOD — Food/Drink Violation', 'Food or drink in prohibited area (PlusPortals code FOOD)', -1, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['3rd', 'Detention']]],
  ['PlusPortals', 'OUTAREA — Out of Area Without Permission', 'Outside assigned area (PlusPortals code OUTAREA)', -2, 'Detention', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Detention']]],
  ['PlusPortals', 'HALL — Hall Pass Misuse', 'Misuse/overstay of hall pass (PlusPortals code HALL)', -1, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['3rd', 'Detention']]],
  // Dress code
  ['PlusPortals', 'UNIFORM — Uniform/Dress Code Violation', 'Out of uniform or dress code (PlusPortals code UNIFORM)', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Parent Call'], ['3rd', 'Detention']]],
  // Technology
  ['PlusPortals', 'DEVICE — Unauthorized Electronic Device', 'Cell phone/device use when not allowed (PlusPortals code DEVICE)', -2, 'Detention', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Detention'], ['3rd', 'Parent Pick-up']]],
  ['PlusPortals', 'AUP — Technology Policy Violation', 'Violation of acceptable use policy (PlusPortals code AUP)', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Tech Privileges Suspended']]],
  // Academic integrity
  ['PlusPortals', 'CHEAT — Cheating', 'Cheating on tests/assignments (PlusPortals code CHEAT)', -5, 'Zero', 0, 1, 'Medium', true, false, [['1st', 'Zero'], ['2nd', 'ISS']]],
  ['PlusPortals', 'PLAG — Plagiarism', 'Submitting work not one\'s own (PlusPortals code PLAG)', -5, 'Zero', 0, 0, 'Medium', true, false, [['1st', 'Zero'], ['2nd', 'ISS']]],
  ['PlusPortals', 'FORGE — Forgery/False Signature', 'Forging parent/staff signature (PlusPortals code FORGE)', -5, 'Detention', 0, 1, 'High', true, false, [['1st', 'Detention'], ['2nd', 'ISS']]],
  ['PlusPortals', 'DISHON — Lying/Dishonesty', 'Deliberate dishonesty to staff (PlusPortals code DISHON)', -2, 'Warning', 0, 0, 'Medium', false, false, [['1st', 'Warning'], ['2nd', 'Detention']]],
  // Detention tracking
  ['PlusPortals', 'MISSDET — Missed Assigned Detention', 'Failure to serve assigned detention (PlusPortals code MISSDET)', -3, 'Detention', 0, 1, 'Medium', true, false, [['1st', 'Double Detention'], ['2nd', 'ISS']]],
  // Bullying / harassment
  ['PlusPortals', 'BULLY — Bullying', 'Repeated intimidation of a peer (PlusPortals code BULLY)', -5, 'OSS', 3, 5, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Extended OSS']]],
  ['PlusPortals', 'CYBER — Cyberbullying', 'Bullying via electronic means (PlusPortals code CYBER)', -5, 'OSS', 3, 5, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Extended OSS']]],
  ['PlusPortals', 'HARASS — Harassment', 'Unwelcome conduct toward another (PlusPortals code HARASS)', -5, 'OSS', 3, 5, 'High', true, true, [['1st', 'OSS'], ['2nd', 'Extended OSS']]],
  ['PlusPortals', 'THREAT — Threats/Intimidation', 'Threatening to harm others (PlusPortals code THREAT)', -10, 'OSS', 5, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Expulsion Referral']]],
  ['PlusPortals', 'HAZE — Hazing', 'Hazing/initiation abuse (PlusPortals code HAZE)', -10, 'OSS', 5, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Expulsion Referral']]],
  // Physical
  ['PlusPortals', 'HORSE — Horseplay/Roughhousing', 'Rough or unsafe play (PlusPortals code HORSE)', -2, 'Warning', 0, 0, 'Low', false, false, [['1st', 'Warning'], ['2nd', 'Detention']]],
  ['PlusPortals', 'FIGHT — Fighting', 'Mutual physical combat (PlusPortals code FIGHT)', -10, 'OSS', 3, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Expulsion Referral']]],
  ['PlusPortals', 'ASSAULT — Physical Assault', 'Unprovoked physical attack (PlusPortals code ASSAULT)', -15, 'OSS', 5, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Expulsion Referral']]],
  ['PlusPortals', 'THEFT — Theft', 'Taking property belonging to another (PlusPortals code THEFT)', -10, 'OSS', 0, 5, 'High', true, true, [['1st', 'OSS + Restitution'], ['2nd', 'Legal Referral']]],
  ['PlusPortals', 'VAND — Vandalism', 'Damaging school or personal property (PlusPortals code VAND)', -10, 'OSS', 0, 5, 'High', true, true, [['1st', 'OSS + Restitution']]],
  // Substance
  ['PlusPortals', 'TOB — Tobacco Possession/Use', 'Tobacco on campus (PlusPortals code TOB)', -5, '3-Day OSS', 3, 3, 'High', true, true, [['1st', '3-Day OSS'], ['2nd', '5-Day OSS']]],
  ['PlusPortals', 'VAP — Vaping/E-Cigarette', 'Vaping devices or use on campus (PlusPortals code VAP)', -5, '3-Day OSS', 3, 3, 'High', true, true, [['1st', '3-Day OSS'], ['2nd', '5-Day OSS']]],
  ['PlusPortals', 'ALC — Alcohol Possession/Use', 'Alcohol on campus (PlusPortals code ALC)', -10, '5-Day OSS', 5, 5, 'Critical', true, true, [['1st', '5-Day OSS'], ['2nd', 'Expulsion Referral']]],
  ['PlusPortals', 'DRUG — Drug Possession/Use', 'Controlled substances on campus (PlusPortals code DRUG)', -15, 'OSS', 5, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Expulsion Referral']]],
  // Safety / weapons
  ['PlusPortals', 'FALSEALRM — False Fire Alarm', 'False alarm or bomb threat (PlusPortals code FALSEALRM)', -10, 'OSS', 5, 10, 'Critical', true, true, [['1st', 'OSS'], ['2nd', 'Legal Referral']]],
  ['PlusPortals', 'WEAPON — Weapon Possession', 'Weapon on campus (PlusPortals code WEAPON)', -25, 'Expulsion', 99, 99, 'Critical', true, true, [['1st', 'Expulsion']]],
  ['PlusPortals', 'ARSON — Arson/Fire Setting', 'Setting or attempting to set fires (PlusPortals code ARSON)', -20, 'Expulsion', 99, 99, 'Critical', true, true, [['1st', 'Expulsion']]],
];

/**
 * Idempotent: adds any PlusPortals code that is not yet in the catalog and
 * leaves every existing row untouched (admin edits to points/consequences
 * survive re-seeding). Runs on every seed so the codes are permanent.
 */
async function seedPlusPortalsCodes(): Promise<void> {
  const existing = await db.violations.findMany({
    where: { category: 'PlusPortals' },
    select: { violation_type: true },
  });
  const present = new Set(existing.map((v) => v.violation_type));
  let added = 0;
  for (const v of PLUSPORTALS_VIOLATIONS) {
    if (present.has(v[1])) continue;
    await db.violations.create({
      data: {
        category: v[0],
        violation_type: v[1],
        description: v[2],
        points_deduction: v[3],
        default_consequence: v[4],
        min_oss_days: v[5],
        max_oss_days: v[6],
        severity: v[7],
        mandatory_parent_contact: v[8],
        mandatory_admin_review: v[9],
        progressive_consequences: JSON.stringify(v[10]),
      },
    });
    added++;
  }
  console.log(
    added > 0
      ? `✓ PlusPortals discipline codes: ${added} added (catalog now ${existing.length + added} codes in the PlusPortals group)`
      : `• PlusPortals discipline codes already present (${existing.length}) — skipping`,
  );
}

// ---------------------------------------------------------------------------
// PlusPortals (Rediker SIS) code SETS — penalties, actions, served statuses
// and locations. The school logs these codes on a discipline referral in
// PlusPortals; this tracker captures the SAME codes so a referral recorded
// here can be mirrored into the SIS without translation. Incidents store the
// combined "CODE — Name" string (same convention as the PlusPortals
// infractions). Penalty rows carry default quantities that pre-fill a
// referral's ISS/OSS/detention numbers.
// ---------------------------------------------------------------------------
type PpCode = {
  code: string;
  name: string;
  description?: string;
  detention_hours?: number;
  days_iss?: number;
  days_oss?: number;
};

const PP_PENALTY_CODES: PpCode[] = [
  { code: 'NONE', name: 'No Penalty', description: 'Referral recorded without a penalty' },
  { code: 'WARN', name: 'Warning', description: 'Verbal/written warning issued' },
  { code: 'PCALL', name: 'Parent Phone Call', description: 'Parent contacted by phone' },
  { code: 'PCONF', name: 'Parent Conference', description: 'Formal parent conference held' },
  { code: 'PLTR', name: 'Parent Letter', description: 'Written notice sent home' },
  { code: 'GRZ', name: 'Grade of Zero', description: 'Zero on the affected assignment/assessment' },
  { code: 'LDET', name: 'Lunch Detention', description: 'Detention served during lunch period' },
  { code: 'DET', name: 'Detention', description: 'After-school detention', detention_hours: 1 },
  { code: 'DDET', name: 'Double Detention', description: 'Two detention sessions assigned', detention_hours: 2 },
  { code: 'SAT', name: 'Saturday School', description: 'Saturday School session assigned', detention_hours: 3 },
  { code: 'ISS', name: 'In-School Suspension', description: 'In-school suspension assigned', days_iss: 1 },
  { code: 'OSS', name: 'Out-of-School Suspension', description: 'Out-of-school suspension assigned', days_oss: 1 },
  { code: 'REST', name: 'Restitution', description: 'Restitution for damage/loss required' },
  { code: 'CSVC', name: 'Community Service', description: 'Community service hours assigned' },
  { code: 'PROB', name: 'Disciplinary Probation', description: 'Student placed on conduct probation' },
  { code: 'POLR', name: 'Police/Legal Referral', description: 'Incident referred to police/legal authorities' },
  { code: 'EXPUL', name: 'Expulsion Referral', description: 'Referred for expulsion hearing' },
];

const PP_ACTION_CODES: PpCode[] = [
  { code: 'OR', name: 'Office Referral', description: 'Student referred to the office' },
  { code: 'WISS', name: 'Warning Issued', description: 'Warning given and documented' },
  { code: 'SC', name: 'Student Conference', description: 'Conference held with the student' },
  { code: 'PC', name: 'Parent Contacted', description: 'Parent/guardian contacted' },
  { code: 'PCR', name: 'Parent Conference Requested', description: 'Conference requested with parent' },
  { code: 'CREF', name: 'Counselor Referral', description: 'Student referred to the school counselor' },
  { code: 'BA', name: 'Behavior Agreement', description: 'Behavior contract/agreement signed' },
  { code: 'SRCH', name: 'Search Conducted', description: 'Administrative search conducted' },
  { code: 'HEAR', name: 'Disciplinary Hearing', description: 'Hearing scheduled with administration' },
  { code: 'POL', name: 'Police Notified', description: 'Incident reported to police' },
  { code: 'MED', name: 'Medical Attention', description: 'Medical attention provided/required' },
  { code: 'ATTF', name: 'Attendance Referral', description: 'Referred to attendance office' },
  { code: 'TECH', name: 'Tech Privileges Suspended', description: 'Technology privileges suspended' },
  { code: 'NACT', name: 'No Action Taken', description: 'Reviewed; no action required' },
];

const PP_SERVED_CODES: PpCode[] = [
  { code: 'PEND', name: 'Pending', description: 'Penalty not yet due / awaiting service' },
  { code: 'SRVD', name: 'Served', description: 'Penalty served in full' },
  { code: 'PSRVD', name: 'Partially Served', description: 'Part of the penalty remains' },
  { code: 'NSRVD', name: 'Not Served', description: 'Student failed to serve the penalty' },
  { code: 'RESCH', name: 'Rescheduled', description: 'Service rescheduled to a new date' },
  { code: 'EXC', name: 'Excused by Admin', description: 'Administrator excused the penalty' },
  { code: 'WAIV', name: 'Waived', description: 'Penalty waived' },
  { code: 'CNCL', name: 'Cancelled', description: 'Penalty cancelled' },
  { code: 'NA', name: 'Not Applicable', description: 'No servable penalty on the referral' },
];

const PP_LOCATION_CODES: PpCode[] = [
  { code: 'CLS', name: 'Classroom', description: 'Inside a classroom' },
  { code: 'HALL', name: 'Hallway', description: 'Corridor/hallway' },
  { code: 'CAFE', name: 'Cafeteria', description: 'Cafeteria/lunchroom' },
  { code: 'PLAY', name: 'Playground', description: 'Playground/recess area' },
  { code: 'GYM', name: 'Gymnasium', description: 'Gym/PE facility' },
  { code: 'ATHF', name: 'Athletic Field', description: 'Sports field/courts' },
  { code: 'REST', name: 'Restroom', description: 'Student restroom' },
  { code: 'OFF', name: 'Front Office', description: 'Main/front office' },
  { code: 'LIB', name: 'Library', description: 'Library/media center' },
  { code: 'LAB', name: 'Lab', description: 'Science or computer lab' },
  { code: 'CHPL', name: 'Chapel', description: 'Chapel/auditorium' },
  { code: 'BUS', name: 'School Bus', description: 'On the school bus' },
  { code: 'PARK', name: 'Parking Lot', description: 'School parking lot' },
  { code: 'GRDS', name: 'Campus Grounds', description: 'General campus grounds' },
  { code: 'OFFC', name: 'Off Campus', description: 'Off school campus' },
  { code: 'VIRT', name: 'Virtual/Online', description: 'Online/virtual school space' },
  { code: 'EVNT', name: 'School Event', description: 'School event or trip' },
  { code: 'OTHER', name: 'Other', description: 'Other location' },
];

const PP_CODE_SETS: Array<{ group: string; label: string; codes: PpCode[] }> = [
  { group: 'penalty', label: 'Penalty', codes: PP_PENALTY_CODES },
  { group: 'action', label: 'Action', codes: PP_ACTION_CODES },
  { group: 'served', label: 'Served', codes: PP_SERVED_CODES },
  { group: 'location', label: 'Location', codes: PP_LOCATION_CODES },
];

/** Combined display value stored on incidents / shown in pickers. */
export function ppCodeValue(group: 'penalty' | 'action' | 'served' | 'location', code: string): string | null {
  const set = PP_CODE_SETS.find((s) => s.group === group);
  const entry = set?.codes.find((c) => c.code === code);
  return entry ? `${entry.code} — ${entry.name}` : null;
}

/**
 * Idempotent: inserts any PlusPortals code-set entry not yet present and never
 * touches existing rows (admin edits/reorderings survive re-seeding).
 */
async function seedPlusPortalsCodeSets(): Promise<void> {
  let total = 0;
  for (const set of PP_CODE_SETS) {
    const existing = await db.disciplineCodes.findMany({
      where: { group: set.group },
      select: { code: true },
    });
    const present = new Set(existing.map((c) => c.code));
    let added = 0;
    for (const [i, c] of set.codes.entries()) {
      if (present.has(c.code)) continue;
      await db.disciplineCodes.create({
        data: {
          group: set.group,
          code: c.code,
          name: c.name,
          description: c.description ?? null,
          detention_hours: c.detention_hours ?? 0,
          days_iss: c.days_iss ?? 0,
          days_oss: c.days_oss ?? 0,
          sort_order: i,
        },
      });
      added++;
    }
    total += added;
    if (added > 0) {
      console.log(`✓ PlusPortals ${set.group} codes: ${added} added (set now ${existing.length + added})`);
    }
  }
  if (total === 0) {
    const count = await db.disciplineCodes.count();
    console.log(`• PlusPortals code sets already present (${count} codes across 4 groups) — skipping`);
  }
}

/**
 * One-time migration: rewrite legacy free-text locations (pre-SIS-codes values)
 * to the matching PlusPortals location code so the whole incident history is
 * filterable/groupable by SIS location code. Idempotent — only rows whose
 * location is exactly a legacy value are updated.
 */
async function migrateLegacyLocations(): Promise<void> {
  const legacyMap: Record<string, string> = {
    'Classroom': 'CLS — Classroom',
    'Hallway': 'HALL — Hallway',
    'Cafeteria': 'CAFE — Cafeteria',
    'Playground': 'PLAY — Playground',
    'Gym': 'GYM — Gymnasium',
    'Bathroom': 'REST — Restroom',
    'Restroom': 'REST — Restroom',
    'Front Office': 'OFF — Front Office',
    'Parking Lot': 'PARK — Parking Lot',
    'Bus': 'BUS — School Bus',
    'School Bus': 'BUS — School Bus',
    'Library': 'LIB — Library',
    'School Grounds': 'GRDS — Campus Grounds',
    'Other': 'OTHER — Other',
  };
  let migrated = 0;
  for (const [legacy, codeValue] of Object.entries(legacyMap)) {
    const res = await db.incidents.updateMany({
      where: { location: legacy },
      data: { location: codeValue },
    });
    migrated += res.count;
  }
  if (migrated > 0) {
    console.log(`✓ Migrated ${migrated} legacy incident location(s) to PlusPortals location codes`);
  }
}

async function seedViolations(): Promise<void> {
  const existing = await db.violations.count();
  if (existing > 0) {
    console.log(`• violations already seeded (${existing} rows) — skipping`);
    return;
  }
  for (const v of VIOLATIONS) {
    await db.violations.create({
      data: {
        category: v[0],
        violation_type: v[1],
        description: v[2],
        points_deduction: v[3],
        default_consequence: v[4],
        min_oss_days: v[5],
        max_oss_days: v[6],
        severity: v[7],
        mandatory_parent_contact: v[8],
        mandatory_admin_review: v[9],
        progressive_consequences: JSON.stringify(v[10]),
      },
    });
  }
  console.log(`✓ seeded ${VIOLATIONS.length} violations`);
}

async function seedAlerts(): Promise<void> {
  const existing = await db.alerts.count();
  if (existing > 0) {
    console.log(`• alerts already seeded (${existing} rows) — skipping`);
    return;
  }
  const alerts: [string, number, string, string][] = [
    ['Repeat Offender', 3, 'Auto-flag when student has 3+ incidents in 30 days', 'Yes'],
    ['Chronic Absences', 5, 'Referral when student has 5+ unexcused absences', 'Yes'],
    ['OSS Limit', 10, 'Admin review required when OSS reaches 10 days', 'Yes'],
  ];
  for (const a of alerts) {
    await db.alerts.create({
      data: { alert_type: a[0], threshold: a[1], action: a[2], enabled: a[3] },
    });
  }
  console.log('✓ seeded 3 alerts');
}

async function seedDefaultSettings(): Promise<void> {
  const settings: [string, string][] = [
    ['school_name', 'SCCS'],
    ['academic_year', '2025-2026'],
    ['max_points', '100'],
    ['passing_threshold', '60'],
  ];
  for (const [key, value] of settings) {
    await db.settings.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  console.log('✓ settings upserted (4 keys)');
}

// ---------------------------------------------------------------------------
// Admin (from env) — created if missing, kept untouched otherwise
// ---------------------------------------------------------------------------

async function createDefaultAdmin(): Promise<number | null> {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!username || !password) {
    const admin = await db.users.findFirst({ where: { role: 'admin' } });
    if (!admin) {
      console.warn('⚠ No admin account exists and INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD are unset.');
      return null;
    }
    return admin.id;
  }

  const existing = await db.users.findUnique({ where: { username } });
  if (existing) {
    console.log(`✓ admin '${username}' already exists (id ${existing.id}) — kept as-is`);
    return existing.id;
  }

  const hash = bcrypt.hashSync(password, 10);
  const first = process.env.INITIAL_ADMIN_FIRST_NAME || 'System';
  const last = process.env.INITIAL_ADMIN_LAST_NAME || 'Administrator';
  const created = await db.users.create({
    data: { username, password: hash, role: 'admin', first_name: first, last_name: last, is_active: true },
  });
  await db.passwordHistory.create({ data: { user_id: created.id, password_hash: hash } });
  console.log(`✓ admin '${username}' created (id ${created.id}) from INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD`);
  return created.id;
}

// ---------------------------------------------------------------------------
// Test accounts + advisor accounts + parent/student links (from sccs/server/db.ts)
// ---------------------------------------------------------------------------

async function seedTestAccounts(): Promise<void> {
  if (process.env.SCCS_SEED_TEST_ACCOUNTS === 'false') return;

  // Prune artifacts left behind by E2E runs (users the admin-dashboard test
  // creates) so the users table stays deterministic across test runs. Real
  // accounts (admin / test / advisor / CarlosP / DanielC and anything created
  // manually by an admin) are NEVER touched.
  const pruned = await db.users.deleteMany({ where: { OR: [{ username: { startsWith: 'e2e-' } }, { username: 'BrowserCheck1' }] } });
  if (pruned.count > 0) {
    const allIds = (await db.users.findMany({ select: { id: true } })).map((u) => u.id);
    await db.passwordHistory.deleteMany({ where: { user_id: { notIn: allIds } } });
    await db.userActivityLog.deleteMany({ where: { user_id: { notIn: allIds } } });
    console.log(`• pruned ${pruned.count} e2e test artifact user(s)`);
  }

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
  const counselorRows = await db.students.findMany({ select: { counselor: true } });
  const counselorCounts = new Map<string, number>();
  for (const s of counselorRows) {
    const c = (s.counselor ?? '').trim();
    if (!c) continue;
    counselorCounts.set(c, (counselorCounts.get(c) ?? 0) + 1);
  }
  let topCounselor: string | null = null;
  let bestCounselorCount = -1;
  for (const [c, n] of counselorCounts) {
    if (n > bestCounselorCount) { bestCounselorCount = n; topCounselor = c; }
  }
  if (topCounselor) {
    const idx = topCounselor.lastIndexOf(' ');
    const first = idx > 0 ? topCounselor.slice(0, idx) : topCounselor;
    const last = idx > 0 ? topCounselor.slice(idx + 1) : '(counselor)';
    accounts.unshift({ username: 'counselor', password: 'Counselor!2026', role: 'counselor', first, last });
  }

  // Teacher account: match a real advisory (homeroom) so classroom scoping has
  // data to show.
  const advisoryRows = await db.students.findMany({ select: { advisory: true } });
  const advisoryCounts = new Map<string, number>();
  for (const s of advisoryRows) {
    const a = (s.advisory ?? '').trim();
    if (!a) continue;
    advisoryCounts.set(a, (advisoryCounts.get(a) ?? 0) + 1);
  }
  let topAdvisory: string | null = null;
  let bestAdvisoryCount = -1;
  for (const [a, n] of advisoryCounts) {
    if (n > bestAdvisoryCount) { bestAdvisoryCount = n; topAdvisory = a; }
  }
  if (topAdvisory) {
    accounts.unshift({ username: 'teacher', password: 'Teacher!2026', role: 'teacher', first: 'Taylor', last: 'Teacher', advisory: topAdvisory });
  }

  // Permanent staff accounts requested by the school (SCCS). Same lifecycle as
  // the other test accounts: created if missing, then never touched again — so
  // password changes made in the app survive re-seeding. CarlosP and DanielC
  // each get their own advisory room (2nd / 3rd most populated) so their
  // teacher scoping has real students behind it.
  const advisoryRanking = [...advisoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
  accounts.push(
    { username: 'CarlosP', password: 'Carlos123456!', role: 'teacher', first: 'Carlos', last: 'P', advisory: advisoryRanking[1] ?? topAdvisory ?? undefined },
    { username: 'DanielC', password: 'Daniel123456!', role: 'teacher', first: 'Daniel', last: 'C', advisory: advisoryRanking[2] ?? topAdvisory ?? undefined },
  );

  for (const a of accounts) {
    const exists = await db.users.findUnique({ where: { username: a.username } });
    if (exists) {
      console.log(`• test account '${a.username}' (${a.role}) already exists — skipping`);
      continue;
    }
    const hash = bcrypt.hashSync(a.password, 10);
    const created = await db.users.create({
      data: {
        username: a.username,
        password: hash,
        role: a.role,
        first_name: a.first.trim(),
        last_name: a.last,
        advisory: a.advisory ?? null,
        is_active: true,
      },
    });
    await db.passwordHistory.create({ data: { user_id: created.id, password_hash: hash } });
    console.log(`✓ test account '${a.username}' (${a.role}) ready`);
  }

  await linkParentTestAccounts();
  await linkStudentTestAccount();
}

/**
 * Link the parent test accounts to real students.
 *   parent  → verified link to a student with a parent email on file
 *   parent2 → verified link to a DIFFERENT student (cross-access testing)
 *   pendingparent → UNVERIFIED link (must receive no access)
 */
async function linkParentTestAccounts(): Promise<void> {
  try {
    const all = await db.students.findMany({ orderBy: { id: 'asc' }, select: { id: true, parent_email: true } });
    const studentsWithEmail = all.filter((s) => (s.parent_email ?? '').trim() !== '').slice(0, 2);
    if (studentsWithEmail.length < 2) return;

    // Give parent/parent2 the matching emails so reconcileParentLinks()
    // creates VERIFIED links automatically (email verification model).
    const assignments = [
      { username: 'parent', email: studentsWithEmail[0].parent_email },
      { username: 'parent2', email: studentsWithEmail[1].parent_email },
    ];
    for (const a of assignments) {
      if (!a.email) continue;
      await db.users.updateMany({
        where: { username: a.username, OR: [{ email: null }, { email: '' }] },
        data: { email: a.email },
      });
    }

    // pendingparent: unverified link to a third student — no access until an
    // admin verifies it.
    const third = all.find((s) => s.id !== studentsWithEmail[0].id && s.id !== studentsWithEmail[1].id);
    if (third) {
      const pendingUser = await db.users.findUnique({ where: { username: 'pendingparent' } });
      if (pendingUser) {
        await db.parentStudentLinks.upsert({
          where: { parent_user_id_student_id: { parent_user_id: pendingUser.id, student_id: third.id } },
          create: { parent_user_id: pendingUser.id, student_id: third.id, verified: false },
          update: {},
        });
      }
    }
  } catch (e) {
    console.error('parent test links:', (e as Error).message);
  }
}

/** Link the student test account to its own record (verified by definition). */
async function linkStudentTestAccount(): Promise<void> {
  try {
    const studentUser = await db.users.findFirst({ where: { username: 'student', role: 'student' } });
    if (!studentUser) return;
    const someStudent = await db.students.findFirst({ orderBy: { id: 'asc' } });
    if (!someStudent) return;
    await db.parentStudentLinks.upsert({
      where: { parent_user_id_student_id: { parent_user_id: studentUser.id, student_id: someStudent.id } },
      create: { parent_user_id: studentUser.id, student_id: someStudent.id, verified: true },
      update: {},
    });
  } catch (e) {
    console.error('student test link:', (e as Error).message);
  }
}

/**
 * One login account (role: 'teacher') for every advisor on the app's hardcoded
 * staff list. Each account is scoped to the advisor's most-populated homeroom
 * (users.advisory = 'Rm N - <name>'). Idempotent — existing usernames are
 * never touched.
 */
const ADVISOR_STAFF = [
  'Mr Adachi', 'Mr Cohello', 'MrDiPascuale', 'Mr Kane', 'Mr Ortiz', 'Ms Aguirre',
  'Ms Camacho', 'Ms Fernandez', 'Ms Guaristi', 'Ms Hopp', 'Ms Meneses', 'Ms Molina',
  'Ms Palacios', 'Ms Rios', 'Ms Robinson', 'Ms Skelly', 'Ms Tello', 'Ms Tomelic',
  'Ms Zuazo', 'Mr Coronado', 'Mr Herbert', 'Mr Kreller', 'Mr Odekerken', 'Mr Soliz',
] as const;

async function seedAdvisorAccounts(): Promise<void> {
  if (process.env.SCCS_SEED_ADVISOR_ACCOUNTS === 'false') return;

  const password = process.env.ADVISOR_ACCOUNT_PASSWORD || 'Teacher!2026';
  const hash = bcrypt.hashSync(password, 10);

  // advisory → student count (for "most populated advisory containing <name>")
  const advisoryRows = await db.students.findMany({ select: { advisory: true } });
  const advisoryCounts = new Map<string, number>();
  for (const s of advisoryRows) {
    const a = (s.advisory ?? '').trim();
    if (!a) continue;
    advisoryCounts.set(a, (advisoryCounts.get(a) ?? 0) + 1);
  }

  for (const name of ADVISOR_STAFF) {
    try {
      // 'Ms Tello' → username 'MsTello' ('MrDiPascuale' stays as-is, no space).
      const username = name.replace(/\s+/g, '');
      // Split honorific from surname: 'Ms Tello' → first 'Ms', last 'Tello';
      // 'MrDiPascuale' → first 'Mr', last 'DiPascuale'.
      const m = /^(Mr|Ms|Mrs|Dr)\s*(.+)$/.exec(name);
      const first = m ? m[1] : name;
      const last = m ? m[2] : '';

      const exists = await db.users.findUnique({ where: { username } });
      if (exists) continue;

      // Scope the teacher to their most-populated advisory room, if any.
      let advisory: string | null = null;
      let best = -1;
      for (const [room, n] of advisoryCounts) {
        if (room.includes(name) && n > best) { best = n; advisory = room; }
      }

      const created = await db.users.create({
        data: {
          username,
          password: hash,
          role: 'teacher',
          first_name: first,
          last_name: last,
          advisory,
          is_active: true,
        },
      });
      await db.passwordHistory.create({ data: { user_id: created.id, password_hash: hash } });
      console.log(`✓ advisor account '${username}' (teacher) ready${advisory ? ` — advisory: ${advisory}` : ''}`);
    } catch (e) {
      console.error(`advisor account ${name}:`, (e as Error).message);
    }
  }
}

/**
 * A parent's email must be linked to the student record before access is
 * granted. Reconcile: any parent-role user whose email matches a student's
 * parent_email gets a VERIFIED link (idempotent).
 */
async function reconcileParentLinks(): Promise<void> {
  try {
    const parentUsers = await db.users.findMany({ where: { role: 'parent' }, select: { id: true, email: true } });
    const students = await db.students.findMany({ select: { id: true, parent_email: true } });
    const byEmail = new Map<string, number[]>();
    for (const s of students) {
      const key = (s.parent_email ?? '').trim().toLowerCase();
      if (!key) continue;
      const list = byEmail.get(key) ?? [];
      list.push(s.id);
      byEmail.set(key, list);
    }
    let created = 0;
    for (const u of parentUsers) {
      const email = (u.email ?? '').trim().toLowerCase();
      if (!email) continue;
      for (const sid of byEmail.get(email) ?? []) {
        await db.parentStudentLinks.upsert({
          where: { parent_user_id_student_id: { parent_user_id: u.id, student_id: sid } },
          create: { parent_user_id: u.id, student_id: sid, verified: true },
          update: { verified: true },
        });
        created++;
      }
    }
    if (created > 0) console.log(`✓ verified ${created} parent↔student email link(s)`);
  } catch (e) {
    console.error('parent link reconcile:', (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Demo dataset (ported from sccs/scripts/seed-demo-data.ts, dates relative to TODAY)
// ---------------------------------------------------------------------------

async function seedDemoData(adminId: number | null): Promise<void> {
  // -------------------------------------------------------------------
  // 0) Pull violation metadata (never hardcode points/severity/consequences).
  //    Scoped to the 22 ORIGINAL catalog rows: the PlusPortals code group is
  //    reserved for real referrals so the deterministic demo distribution is
  //    unaffected by how many SIS codes are in the catalog.
  // -------------------------------------------------------------------
  const violations: ViolationLite[] = await db.violations.findMany({
    where: { category: { not: 'PlusPortals' } },
    orderBy: { id: 'asc' },
    select: { id: true, violation_type: true, severity: true, points_deduction: true, default_consequence: true },
  });
  if (violations.length !== 22) throw new Error(`expected 22 catalog violations, found ${violations.length}`);
  const bySeverity = (sev: string): ViolationLite[] => violations.filter((v) => v.severity === sev);
  const LOW = bySeverity('Low'), MED = bySeverity('Medium'), HIGH = bySeverity('High'), CRIT = bySeverity('Critical');
  // Violations that make no sense for elementary students → redrawn below.
  const ELEMENTARY_BLOCKLIST = new Set(['Tobacco Possession', 'Vaping', 'Class Cut/AWOL']);

  function pickViolation(grade: number, ordinal: number): ViolationLite {
    const severityWeights = ordinal <= 1 ? [60, 20, 15, 5]
      : ordinal === 2 ? [52, 22, 19, 7]
      : ordinal <= 4 ? [44, 24, 26, 6]
      : [38, 24, 30, 8];
    const pools: ViolationLite[][] = [LOW, MED, HIGH, CRIT];
    // wpick chooses the severity pool, pick() draws a violation inside it.
    let v = pick(wpick(pools, severityWeights));
    if (grade <= 5 && ELEMENTARY_BLOCKLIST.has(v.violation_type)) v = pick(LOW);
    return v;
  }

  // -------------------------------------------------------------------
  // 1) Idempotent cleanup of previously seeded DEMO rows (FK order).
  //    Demo rows = student_id BETWEEN 'S-2026-002' AND 'S-2026-601'.
  //    Violations / alerts / settings / users are never touched here.
  //    (parent_student_links is deleted explicitly — the original pg schema
  //    cascaded those rows when demo students were removed.)
  // -------------------------------------------------------------------
  console.log('Cleaning previously seeded demo rows (if any)…');
  const demoStudentIdRows = await db.students.findMany({
    where: { student_id: { gte: DEMO_ID_MIN, lte: DEMO_ID_MAX } },
    select: { id: true },
  });
  const demoStudentIds = demoStudentIdRows.map((r) => r.id);
  const demoIncidentIds: number[] = [];
  for (const part of chunk(demoStudentIds, 300)) {
    const rows = await db.incidents.findMany({ where: { student_id: { in: part } }, select: { id: true } });
    demoIncidentIds.push(...rows.map((r) => r.id));
  }
  const delCount = async (label: string, ids: number[], run: (part: number[]) => Promise<number>): Promise<void> => {
    let total = 0;
    for (const part of chunk(ids, 300)) total += await run(part);
    console.log(`  cleanup: removed ${total} ${label}`);
  };
  await delCount('incident_status_logs', demoIncidentIds, (p) =>
    db.incidentStatusLogs.deleteMany({ where: { incident_id: { in: p } } }).then((r) => r.count));
  await delCount('parent_contacts', demoIncidentIds, (p) =>
    db.parentContacts.deleteMany({ where: { incident_id: { in: p } } }).then((r) => r.count));
  await delCount('incident_evidence', demoIncidentIds, (p) =>
    db.incidentEvidence.deleteMany({ where: { incident_id: { in: p } } }).then((r) => r.count));
  await delCount('parent_student_links', demoStudentIds, (p) =>
    db.parentStudentLinks.deleteMany({ where: { student_id: { in: p } } }).then((r) => r.count));
  {
    let mtssDeleted = 0;
    for (const part of chunk(demoStudentIds, 300)) {
      mtssDeleted += (await db.mtssInterventions.deleteMany({ where: { student_id: { in: part } } })).count;
    }
    for (const part of chunk(demoIncidentIds, 300)) {
      mtssDeleted += (await db.mtssInterventions.deleteMany({ where: { incident_link: { in: part } } })).count;
    }
    console.log(`  cleanup: removed ${mtssDeleted} mtss_interventions`);
  }
  await delCount('incidents', demoStudentIds, (p) =>
    db.incidents.deleteMany({ where: { student_id: { in: p } } }).then((r) => r.count));
  const studentsDeleted = await db.students.deleteMany({
    where: { student_id: { gte: DEMO_ID_MIN, lte: DEMO_ID_MAX } },
  });
  console.log(`  cleanup: removed ${studentsDeleted.count} students`);

  // Existing per-day incident_id prefixes and the full set of existing ids, so
  // generated YYMMDD-NNN ids can never collide.
  const existingIncidentIds = (await db.incidents.findMany({ select: { incident_id: true } })).map((r) => r.incident_id);
  const existingPerDay = new Map<string, number>();
  const existingIds = new Set<string>(existingIncidentIds);
  for (const id of existingIncidentIds) {
    const prefix = id.split('-')[0];
    existingPerDay.set(prefix, (existingPerDay.get(prefix) ?? 0) + 1);
  }
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

      const birthYear = Number(TODAY.slice(0, 4)) - (grade + 5); // age ≈ grade + 5
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
  console.log(`Incident cohorts: 0-incident=${DEMO_STUDENT_COUNT - incidentCounts.size}, 1=${oneIdx.length + grade0Idx.length}, 2=${twoIdx.length}, repeat(3-7)=${repeatIdx.length}; total incidents=${totalIncidents}`);

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
    if (b.days.length === 0) return w;
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

  const buildIncident = (studentIdx: number, ordinal: number, date: string, forcedViolation?: ViolationLite): void => {
    const st = students[studentIdx];
    const v = forcedViolation ?? pickViolation(st.grade, ordinal);
    const status = statusFor(date);
    const consequence = consequenceFor(v, ordinal);
    const sanction = sanctionFor(consequence);
    const penalty = penaltyFor(consequence);
    const penalty_served = servedFor(penalty, status, ordinal);
    const location = st.grade === 0 ? pick(LOCATIONS_EARLY) : pick(LOCATIONS);
    // Narratives read better with the plain location name, not "CLS — Classroom".
    const locationName = location.split(' — ')[1] ?? location;
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
      description: pick(DESCRIPTION_TEMPLATES).replace('{v}', v.violation_type).replace('{loc}', locationName),
      witnesses, parent_contacted, contact_date, action_taken, consequence,
      penalty, penalty_served,
      points_deducted: v.points_deduction,
      ...sanction,
      referral_date: (v.severity === 'Medium' || v.severity === 'High' || v.severity === 'Critical') && chance(0.3) ? date : null,
      administrator_id: adminId,
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

  // Force exactly 4 incidents dated TODAY, and make sure the two preceding days
  // each carry several incidents. Dates only move within the last 30 days, so
  // per-student chronology/escalation stays believable. (The original forced
  // 2026-09-10 / 2026-09-11 with TODAY = 2026-09-12 — relative: TODAY-2/TODAY-1.)
  const todayTargets = shuffle(incidents.filter((x) => daysBetween(x.date, TODAY) <= 30)).slice(0, 4);
  for (const inc of todayTargets) redate(inc, TODAY);
  for (const want of [addDays(TODAY, -2), addDays(TODAY, -1)]) {
    let have = incidents.filter((x) => x.date === want).length;
    const spares = shuffle(incidents.filter((x) => x.date >= addDays(TODAY, -30) && x.date <= addDays(TODAY, -3)));
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
  //    (SQLite: no createMany — create() inside chunked $transaction batches)
  // -------------------------------------------------------------------
  const studentDbId = new Map<string, number>(); // student_id text → db id
  const studentInsertBatch = 200;
  let insertedStudents = 0;
  for (const part of chunk(students, studentInsertBatch)) {
    await db.$transaction(
      part.map((st) => db.students.create({
        data: {
          student_id: st.student_id,
          last_name: st.last_name,
          first_name: st.first_name,
          grade: st.grade,
          section: st.section,
          house_team: st.house_team,
          counselor: st.counselor,
          advisory: st.advisory,
          gpa: st.gpa,
          total_points: st.total_points,
          conduct_status: st.conduct_status,
          observations: st.observations,
          date_of_birth: st.date_of_birth,
          parent_name: st.parent_name,
          parent_phone: st.parent_phone,
          parent_email: st.parent_email,
          gender: st.gender,
        },
        select: { id: true, student_id: true },
      })),
    );
    insertedStudents += part.length;
  }
  // Re-read the inserted demo rows in id order to build the id map (inserts
  // happened in student_id order, so ids ascend with the array).
  for (const row of await db.students.findMany({
    where: { student_id: { gte: DEMO_ID_MIN, lte: DEMO_ID_MAX } },
    orderBy: { id: 'asc' },
    select: { id: true, student_id: true },
  })) {
    studentDbId.set(row.student_id, row.id);
  }
  if (studentDbId.size !== students.length) throw new Error(`expected ${students.length} inserted students, found ${studentDbId.size}`);
  console.log(`Inserted ${insertedStudents} students`);

  const incidentRows: { id: number; incident_id: string; student_id: number; status: string }[] = [];
  const incidentInsertBatch = 150;
  for (const part of chunk(incidents, incidentInsertBatch)) {
    const res = await db.$transaction(
      part.map((inc) => db.incidents.create({
        data: {
          incident_id: inc.incident_id,
          date: inc.date,
          time: inc.time,
          student_id: studentDbId.get(students[inc.studentIdx].student_id)!,
          violation_id: inc.violation.id,
          location: inc.location,
          description: inc.description,
          witnesses: inc.witnesses,
          parent_contacted: inc.parent_contacted,
          contact_date: inc.contact_date,
          action_taken: inc.action_taken,
          consequence: inc.consequence,
          penalty: inc.penalty,
          penalty_served: inc.penalty_served,
          points_deducted: inc.points_deducted,
          days_iss: inc.days_iss,
          days_oss: inc.days_oss,
          detention_hours: inc.detention_hours,
          referral_date: inc.referral_date,
          administrator_id: inc.administrator_id,
          notes: inc.notes,
          follow_up_needed: inc.follow_up_needed,
          follow_up_date: inc.follow_up_date,
          status: inc.status,
          resolved_date: inc.resolved_date,
          reported_by: inc.reported_by,
          escalated_to_principal: inc.escalated_to_principal,
          principal_notified_at: inc.principal_notified_at,
          created_at: new Date(`${inc.date}T${inc.time}:00Z`), // `${date} ${time}:00`
          // NOTE: the original also stored incidents.advisor (student's counselor);
          // the Prisma port of this table has no advisor column, so it is omitted.
        },
        select: { id: true, incident_id: true, student_id: true, status: true },
      })),
    );
    incidentRows.push(...res);
  }
  console.log(`Inserted ${incidentRows.length} incidents`);

  // incident db ids per student (for MTSS incident_link + parent_contacts)
  const incidentsByStudent = new Map<number, { id: number; status: string }[]>();
  for (const r of incidentRows) {
    const sid = r.student_id;
    if (!incidentsByStudent.has(sid)) incidentsByStudent.set(sid, []);
    incidentsByStudent.get(sid)!.push({ id: r.id, status: r.status });
  }

  // Recompute total_points + conduct_status for DEMO students only
  // (100 + sum(points_deducted), floored at 0; Good ≥ 80, Warning ≥ 60, else Probation).
  const ptsByStudent = new Map<number, number>();
  for (const inc of incidents) {
    const sid = studentDbId.get(students[inc.studentIdx].student_id)!;
    ptsByStudent.set(sid, (ptsByStudent.get(sid) ?? 0) + inc.points_deducted);
  }
  const recomputeRows: { id: number; total_points: number; conduct_status: string }[] = [];
  for (const [sid, pts] of ptsByStudent) {
    const total = Math.max(0, 100 + pts);
    recomputeRows.push({
      id: sid,
      total_points: total,
      conduct_status: total >= 80 ? 'Good' : total >= 60 ? 'Warning' : 'Probation',
    });
  }
  for (const part of chunk(recomputeRows, 200)) {
    await db.$transaction(part.map((r) =>
      db.students.update({ where: { id: r.id }, data: { total_points: r.total_points, conduct_status: r.conduct_status } })));
  }
  console.log(`Recomputed total_points/conduct_status for ${recomputeRows.length} demo students`);

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
  // MTSS start bounds relative to today (original: startMin 2026-03-12 = TODAY-184;
  // startMax Completed 2026-06-10 = TODAY-94, In Progress 2026-08-25 = TODAY-18,
  // Not Started = TODAY; review cap 2026-10-15 = TODAY+33).
  const MTSS_START_MIN = addDays(TODAY, -184);
  const MTSS_REVIEW_MAX = addDays(TODAY, 33);
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
      const startMax = progress === 'Completed' ? addDays(TODAY, -94)
        : progress === 'Not Started' ? TODAY
        : addDays(TODAY, -18);
      let start_date = clampISO(
        addDays(MTSS_START_MIN, rint(0, Math.max(0, daysBetween(MTSS_START_MIN, startMax)))), MTSS_START_MIN, startMax);
      if (!isSchoolDay(start_date)) start_date = addDays(start_date, dow(start_date) === 6 ? 2 : 1);
      const end_date = progress === 'Completed'
        ? clampISO(addDays(start_date, rint(30, 80)), start_date, TODAY) : null;
      const review_date = clampISO(addDays(start_date, rint(14, 42)), start_date, MTSS_REVIEW_MAX);

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
        incident_link: studentIncidents.length > 0 && chance(0.4) ? pick(studentIncidents).id : null,
        advisor: st.counselor,
        tier_history,
      });
    }
  }

  for (const part of chunk(mtss, 100)) {
    await db.$transaction(part.map((m) => db.mtssInterventions.create({
      data: {
        student_id: studentDbId.get(students[m.studentIdx].student_id)!,
        tier: m.tier,
        intervention: m.intervention,
        start_date: m.start_date,
        end_date: m.end_date,
        progress: m.progress,
        notes: m.notes,
        intervention_goal: m.intervention_goal,
        progress_monitoring: m.progress_monitoring,
        review_date: m.review_date,
        exit_criteria: m.exit_criteria,
        incident_link: m.incident_link,
        advisor: m.advisor,
        tier_history: JSON.stringify(m.tier_history),
      },
    })));
  }
  console.log(`Inserted ${mtss.length} MTSS interventions`);

  // -------------------------------------------------------------------
  // 9) parent_contacts — one row for ~30% of Resolved incidents
  // -------------------------------------------------------------------
  const seedByIncidentId = new Map<string, IncidentSeed>(incidents.map((i) => [i.incident_id, i]));
  const parentContacts: ParentContactSeed[] = [];
  for (const r of incidentRows) {
    if (r.status !== 'Resolved' || !chance(0.3)) continue;
    const sid = r.student_id;
    const st = students[dbIdToIdx.get(sid)!];
    const seed = seedByIncidentId.get(r.incident_id)!;
    parentContacts.push({
      incidentDbId: r.id,
      contact_date: clampISO(addDays(seed.date, chance(0.7) ? 0 : 1), seed.date, TODAY),
      contact_method: wpick(['Phone', 'Email', 'In Person'] as const, [55, 25, 20]),
      parent_name: st.parent_name,
      notes: pick(PARENT_CONTACT_NOTES),
      follow_up_required: 'No',
    });
  }
  for (const part of chunk(parentContacts, 100)) {
    await db.$transaction(part.map((pc) => db.parentContacts.create({
      data: {
        incident_id: pc.incidentDbId,
        contact_date: pc.contact_date,
        contact_method: pc.contact_method,
        parent_name: pc.parent_name,
        notes: pc.notes,
        follow_up_required: pc.follow_up_required,
      },
    })));
  }
  console.log(`Inserted ${parentContacts.length} parent contact records`);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verify(): Promise<void> {
  console.log('\n— Row counts');
  const counts = {
    users: await db.users.count(),
    students: await db.students.count(),
    violations: await db.violations.count(),
    incidents: await db.incidents.count(),
    mtss_interventions: await db.mtssInterventions.count(),
    alerts: await db.alerts.count(),
    settings: await db.settings.count(),
    parent_contacts: await db.parentContacts.count(),
    parent_student_links: await db.parentStudentLinks.count(),
    password_history: await db.passwordHistory.count(),
  };
  console.table(counts);

  console.log('— Users by role');
  const byRole = await db.users.groupBy({ by: ['role'], _count: { _all: true } });
  console.table(byRole.map((r) => ({ role: r.role, n: r._count._all })));

  console.log('— Demo students / grade distribution');
  const demoCount = await db.students.count({ where: { student_id: { gte: DEMO_ID_MIN, lte: DEMO_ID_MAX } } });
  const byGrade = await db.students.groupBy({ by: ['grade'], _count: { _all: true }, orderBy: { grade: 'asc' } });
  console.log(`  demo students (S-2026-002…S-2026-601): ${demoCount}`);
  console.log(`  grades: ${byGrade.map((g) => `${g.grade}:${g._count._all}`).join(' ')}`);

  console.log('— Incidents by status');
  const byStatus = await db.incidents.groupBy({ by: ['status'], _count: { _all: true } });
  console.table(byStatus.map((r) => ({ status: r.status, n: r._count._all })));

  console.log('— Incident date freshness (relative to today)');
  const dateRows = await db.incidents.findMany({ select: { date: true } });
  const dates = dateRows.map((r) => r.date);
  const minDate = dates.reduce((m, d) => (d < m ? d : m), dates[0] ?? TODAY);
  const maxDate = dates.reduce((m, d) => (d > m ? d : m), dates[0] ?? TODAY);
  const weekendExceptToday = dates.filter((d) => d !== TODAY && isWeekend(d)).length;
  const inSummerWindow = dates.filter((d) => inSummer(d)).length;
  console.log(`  min=${minDate} max=${maxDate} today=${TODAY}`);
  console.log(`  dated today: ${dates.filter((d) => d === TODAY).length}, last 7 days: ${dates.filter((d) => d >= addDays(TODAY, -6)).length}, last 30 days: ${dates.filter((d) => d >= addDays(TODAY, -30)).length}`);
  console.log(`  weekend (excl today): ${weekendExceptToday}, summer-window: ${inSummerWindow} (both must be 0)`);

  console.log('— incident_id format + per-day uniqueness');
  const idRows = await db.incidents.findMany({ select: { incident_id: true } });
  const ids = idRows.map((r) => r.incident_id);
  const badFormat = ids.filter((id) => !/^\d{6}-\d{3}$/.test(id));
  const dupes = ids.length - new Set(ids).size;
  const perDay = new Map<string, number>();
  for (const id of ids) {
    const p = id.split('-')[0];
    perDay.set(p, (perDay.get(p) ?? 0) + 1);
  }
  console.log(`  malformed ids: ${badFormat.length}, duplicate ids: ${dupes} (both must be 0)`);
  console.log(`  today's prefix ${TODAY.replace(/-/g, '').slice(2)}: ${perDay.get(TODAY.replace(/-/g, '').slice(2)) ?? 0} incidents`);

  console.log('— MTSS by tier / progress / review window');
  const byTier = await db.mtssInterventions.groupBy({ by: ['tier'], _count: { _all: true }, orderBy: { tier: 'asc' } });
  const byProgress = await db.mtssInterventions.groupBy({ by: ['progress'], _count: { _all: true } });
  const reviewSoon = await db.mtssInterventions.count({
    where: { review_date: { gte: TODAY, lte: addDays(TODAY, 30) } },
  });
  console.log(`  tiers: ${byTier.map((t) => `T${t.tier}:${t._count._all}`).join(' ')}`);
  console.log(`  progress: ${byProgress.map((p) => `${p.progress}:${p._count._all}`).join(' ')}`);
  console.log(`  review_date within next 30 days: ${reviewSoon}`);

  console.log('— Conduct status distribution');
  const byConduct = await db.students.groupBy({ by: ['conduct_status'], _count: { _all: true } });
  console.log(`  ${byConduct.map((c) => `${c.conduct_status}:${c._count._all}`).join(' ')}`);

  console.log('— Sample students with incidents (total_points < 100)');
  const samples = await db.students.findMany({
    where: { total_points: { lt: 100 }, student_id: { gte: DEMO_ID_MIN, lte: DEMO_ID_MAX } },
    orderBy: { student_id: 'asc' },
    take: 3,
  });
  for (const s of samples) {
    const n = await db.incidents.count({ where: { student_id: s.id } });
    console.log(`  ${s.student_id} ${s.first_name} ${s.last_name} — grade ${s.grade}, ${n} incidents, total_points=${s.total_points}, conduct=${s.conduct_status}`);
  }

  console.log('— FK orphan checks (all must be 0)');
  const incRows = await db.incidents.findMany({ select: { id: true, incident_id: true, student_id: true, violation_id: true } });
  const incIdSet = new Set(incRows.map((r) => r.id));
  const studentIds = new Set((await db.students.findMany({ select: { id: true } })).map((s) => s.id));
  const violationIds = new Set((await db.violations.findMany({ select: { id: true } })).map((v) => v.id));
  const orphanIncidents = incRows.filter((r) => !studentIds.has(r.student_id)).length;
  const orphanViolations = incRows.filter((r) => !violationIds.has(r.violation_id)).length;
  const mtssRows = await db.mtssInterventions.findMany({ select: { student_id: true, incident_link: true } });
  const orphanMtss = mtssRows.filter((m) => !studentIds.has(m.student_id)).length;
  const orphanMtssIncidentLinks = mtssRows.filter((m) => m.incident_link != null && !incIdSet.has(m.incident_link)).length;
  const pcRows = await db.parentContacts.findMany({ select: { incident_id: true } });
  const orphanParentContacts = pcRows.filter((p) => !incIdSet.has(p.incident_id)).length;
  console.log(`  orphan incidents→students: ${orphanIncidents}, incidents→violations: ${orphanViolations}`);
  console.log(`  orphan mtss→students: ${orphanMtss}, mtss→incidents: ${orphanMtssIncidentLinks}, parent_contacts→incidents: ${orphanParentContacts}`);

  console.log('— parent_student_links detail');
  const userMap = new Map((await db.users.findMany({ select: { id: true, username: true } })).map((u) => [u.id, u.username]));
  const studentMap = new Map((await db.students.findMany({ select: { id: true, student_id: true } })).map((s) => [s.id, s.student_id]));
  for (const l of await db.parentStudentLinks.findMany({ orderBy: { id: 'asc' } })) {
    console.log(`  ${userMap.get(l.parent_user_id) ?? '?'} → ${studentMap.get(l.student_id) ?? '?'} (verified=${l.verified})`);
  }

  console.log('— Top violation types used');
  const violationTypes = new Map((await db.violations.findMany({ select: { id: true, violation_type: true } })).map((v) => [v.id, v.violation_type]));
  const usage = new Map<string, number>();
  for (const r of incRows) {
    const t = violationTypes.get(r.violation_id) ?? '?';
    usage.set(t, (usage.get(t) ?? 0) + 1);
  }
  console.log(`  ${[...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t}:${n}`).join(' ')}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Learning support plans (IEP / 504 / ELL / BIP / Gifted / Health) and PBIS
// recognitions for the demo roster. Uses its OWN PRNG so adding this data
// never shifts the deterministic incident/MTSS distribution above.
// ---------------------------------------------------------------------------
const PLAN_NEEDS: Record<string, readonly string[]> = {
  IEP: [
    'Specific Learning Disability (Dyslexia)', 'Specific Learning Disability (Dyscalculia)',
    'Speech or Language Impairment', 'Autism Spectrum Disorder',
    'Other Health Impairment (ADHD)', 'Emotional Disturbance',
  ],
  '504': ['ADHD', 'Generalized Anxiety Disorder', 'Type 1 Diabetes', 'Dysgraphia', 'Hearing Impairment'],
  ELL: ['English Learner (WIDA level 2)', 'English Learner (WIDA level 3)', 'English Learner (WIDA level 4)'],
  BIP: ['Behavior Intervention Plan (task avoidance)', 'Behavior Intervention Plan (peer conflict)'],
  Gifted: ['Gifted & Talented (Mathematics)', 'Gifted & Talented (Language Arts)'],
  Health: ['Severe Food Allergy (Epinephrine on file)', 'Asthma Action Plan', 'Seizure Action Plan'],
};

const ACCOMMODATION_BANK: Record<string, [string, string][]> = {
  IEP: [
    ['Timing', 'Extended time (1.5x) on tests and quizzes'],
    ['Setting', 'Preferential seating near instruction, away from doors'],
    ['Presentation', 'Text-to-speech for reading passages'],
    ['Presentation', 'Chunked directions with a written checklist'],
    ['Response', 'May respond orally or dictate written answers'],
    ['Setting', 'Testing in a small-group, reduced-distraction room'],
    ['Assistive Technology', 'Access to audiobooks and speech-to-text'],
    ['Behavioral', 'Break pass: up to two 5-minute breaks per class'],
    ['Timing', 'Reduced homework load: core problems only'],
  ],
  '504': [
    ['Timing', 'Extended time (1.5x) on tests'],
    ['Behavioral', 'Movement breaks and fidget tools allowed'],
    ['Setting', 'Seating away from high-traffic areas'],
    ['Response', 'Use of laptop for written work'],
    ['Presentation', 'Copy of class notes provided'],
    ['Setting', 'Unrestricted access to water, snacks and restroom'],
    ['Behavioral', 'Private check-in before tests to reduce anxiety'],
  ],
  ELL: [
    ['Presentation', 'Bilingual glossary allowed on assessments'],
    ['Presentation', 'Visual supports and sentence frames'],
    ['Timing', 'Extended time on reading-heavy tasks'],
    ['Response', 'May answer in first language, then translate with support'],
  ],
  BIP: [
    ['Behavioral', 'Check-in / check-out with counselor daily'],
    ['Behavioral', 'Positive reinforcement chart reviewed each period'],
    ['Behavioral', 'Calm-down space available with adult supervision'],
    ['Setting', 'Seat near a positive peer model'],
  ],
  Gifted: [
    ['Presentation', 'Compacted curriculum and enrichment extensions'],
    ['Response', 'Independent project options in place of practice sets'],
  ],
  Health: [
    ['Setting', 'Emergency medication kept in classroom and nurse office'],
    ['Timing', 'Excused for health-office visits without penalty'],
  ],
};

const BEHAVIOR_NOTES: Record<string, readonly string[]> = {
  IEP: [
    'Responds best to private redirection. Avoid public correction; offer a break pass before escalating.',
    'Processing delays: allow 10 seconds of wait time and repeat directions once, calmly, before any consequence.',
    'Sensory overload in loud spaces can look like defiance. Offer headphones or a quiet space first.',
  ],
  '504': [
    'Impulsivity is part of the documented disability. Use a nonverbal cue before a verbal warning.',
    'Anxiety may present as refusal. Check in privately before treating it as noncompliance.',
  ],
  BIP: [
    'Follow the BIP: planned ignoring for minor attention-seeking, praise replacement behaviour within 5 seconds.',
    'Triggers: unstructured transitions and peer teasing. Pre-correct before transitions.',
  ],
};

async function seedLearningSupport(): Promise<void> {
  const r = mulberry32(5_042_026);
  const rp = <T,>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
  const demo = await db.students.findMany({
    where: { student_id: { gte: DEMO_ID_MIN, lte: DEMO_ID_MAX } },
    orderBy: { student_id: 'asc' },
    select: { id: true, student_id: true, grade: true },
  });
  const ids = demo.map((s) => s.id);
  for (const part of chunk(ids, 300)) {
    await db.recognitions.deleteMany({ where: { student_id: { in: part } } });
    await db.supportPlans.deleteMany({ where: { student_id: { in: part } } });
  }

  // Students with the most suspension days are overrepresented among students
  // with disabilities in real data; give the top few an IEP so the IDEA
  // manifestation-determination alert has realistic demo cases.
  const yearStart = (() => {
    const t = toUtc(TODAY);
    const y = t.getUTCMonth() >= 7 ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
    return `${y}-08-01`;
  })();
  const oss = await db.incidents.groupBy({
    by: ['student_id'],
    where: { student_id: { in: ids }, date: { gte: yearStart } },
    _sum: { days_oss: true },
  });
  const heavy = oss
    .filter((o) => (o._sum.days_oss ?? 0) >= 6)
    .sort((a, b) => (b._sum.days_oss ?? 0) - (a._sum.days_oss ?? 0))
    .slice(0, 3)
    .map((o) => o.student_id);

  const plans: { student_id: number; type: string }[] = [];
  // S-2026-002 (first demo student) always has an IEP + BIP: stable fixture for tests.
  if (demo[0]) plans.push({ student_id: demo[0].id, type: 'IEP' }, { student_id: demo[0].id, type: 'BIP' });
  for (const id of heavy) if (id !== demo[0]?.id) plans.push({ student_id: id, type: 'IEP' });
  for (const s of demo.slice(1)) {
    if (heavy.includes(s.id)) continue;
    const roll = r();
    if (roll < 0.06) plans.push({ student_id: s.id, type: 'IEP' });
    else if (roll < 0.10) plans.push({ student_id: s.id, type: '504' });
    else if (roll < 0.16) plans.push({ student_id: s.id, type: 'ELL' });
    else if (roll < 0.19 && s.grade >= 3) plans.push({ student_id: s.id, type: 'Gifted' });
    else if (roll < 0.21) plans.push({ student_id: s.id, type: 'Health' });
    if (roll < 0.06 && r() < 0.3) plans.push({ student_id: s.id, type: 'BIP' });
  }

  for (const p of plans) {
    const start = addDays(TODAY, -Math.floor(30 + r() * 300));
    const review = addDays(start, 365);
    const bank = ACCOMMODATION_BANK[p.type];
    const count = Math.min(bank.length, p.type === 'IEP' ? 5 : p.type === '504' ? 4 : 2 + Math.floor(r() * 2));
    const chosen = [...bank].sort(() => r() - 0.5).slice(0, count);
    await db.supportPlans.create({
      data: {
        student_id: p.student_id,
        plan_type: p.type,
        primary_need: rp(PLAN_NEEDS[p.type]),
        case_manager: rp(COUNSELORS),
        start_date: start,
        review_date: review,
        status: review < addDays(TODAY, 30) ? 'Under Review' : 'Active',
        behavior_considerations: BEHAVIOR_NOTES[p.type] ? rp(BEHAVIOR_NOTES[p.type]) : null,
        parent_consent: true,
        notes: null,
        accommodations: {
          create: chosen.map(([category, description]) => ({
            category,
            description,
            applies_to: description.includes('test') ? 'Assessments' : 'All classes',
          })),
        },
      },
    });
  }
  console.log(`Inserted ${plans.length} learning support plans`);

  // PBIS recognitions over the last ~60 school days.
  const CATEGORIES = ['Respect', 'Responsibility', 'Integrity', 'Kindness', 'Leadership', 'Excellence'] as const;
  const NOTES: Record<string, readonly string[]> = {
    Respect: ['Listened carefully and waited their turn in discussion', 'Showed courtesy to a substitute teacher'],
    Responsibility: ['Turned in every assignment on time this week', 'Cleaned up the lab station without being asked'],
    Integrity: ['Returned a lost wallet to the front office', 'Owned a mistake and made it right'],
    Kindness: ['Included a new student at lunch', 'Helped a classmate who was struggling'],
    Leadership: ['Led their group calmly through the project', 'Organized the class recycling team'],
    Excellence: ['Big improvement on the unit test', 'Outstanding effort in the science fair'],
  };
  const days = schoolDays(addDays(TODAY, -90), TODAY);
  const recs: { student_id: number; category: string; points: number; note: string; awarded_by: string; date: string }[] = [];
  for (let i = 0; i < 720 && days.length; i++) {
    const s = demo[Math.floor(r() * demo.length)];
    const category = rp(CATEGORIES);
    recs.push({
      student_id: s.id,
      category,
      points: r() < 0.75 ? 1 : r() < 0.8 ? 2 : 3,
      note: rp(NOTES[category]),
      awarded_by: rp(TEACHERS),
      date: days[Math.floor(Math.pow(r(), 0.7) * days.length)],
    });
  }
  for (const part of chunk(recs, 200)) await db.recognitions.createMany({ data: part });
  console.log(`Inserted ${recs.length} PBIS recognitions`);
}

async function main(): Promise<void> {
  console.log(`SCCS seed — target database: ${process.env.DATABASE_URL ?? '(from .env)'}`);
  console.log(`Today (UTC): ${TODAY}\n`);

  // Reference data + admin first (never re-touched once seeded).
  await seedViolations();
  await seedPlusPortalsCodes();
  await seedPlusPortalsCodeSets();
  await seedAlerts();
  await seedDefaultSettings();
  const adminId = await createDefaultAdmin();

  // Demo dataset (idempotent: wipes + regenerates S-2026-002…S-2026-601 rows).
  await seedDemoData(adminId);

  // Rewrite legacy free-text locations (pre-code-set rows) to SIS location codes.
  await migrateLegacyLocations();

  // Learning support plans + PBIS recognitions for the demo roster.
  await seedLearningSupport();

  // Accounts + links (counselor/teacher accounts match the freshly seeded roster).
  await seedTestAccounts();
  await seedAdvisorAccounts();
  await reconcileParentLinks();

  await verify();
  console.log('\n✅ Seed complete (idempotent — safe to re-run).');
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
