// Shared helpers for the SCCS API routes (Next.js port). These complement the
// project-wide helpers in src/lib (sccs-auth, sccs-validation,
// sccs-rate-limit, sccs-serialize) with the small utilities the original
// Express handlers got "for free" from pg / node-postgres.
import { flattenIncident, flattenMtss } from '@/lib/sccs-serialize';

// ---------------------------------------------------------------------------
// JSON columns
// ---------------------------------------------------------------------------
// The original PostgreSQL schema used JSONB for these columns, so rows came
// back parsed. In the SQLite port they are TEXT and must be parsed manually.
/** Parse a JSON-text column the way pg parsed JSONB; null/invalid → null. */
export function parseJsonColumn<T = unknown>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Row flattening (student/violation joins)
// ---------------------------------------------------------------------------
type FlattenedIncident = ReturnType<typeof flattenIncident>;

/** flattenIncident leaves `student`/`violation` as undefined keys — remove them
 *  outright so the JSON response contains no such keys at all. */
export function stripIncidentRefs(row: FlattenedIncident): Omit<FlattenedIncident, 'student' | 'violation'> {
  const clone = { ...row };
  delete (clone as Partial<FlattenedIncident>).student;
  delete (clone as Partial<FlattenedIncident>).violation;
  return clone;
}

type FlattenedMtss = ReturnType<typeof flattenMtss>;

/** flattenMtss leaves `student` as an undefined key — remove it, and parse the
 *  tier_history JSON-text column the way the original JSONB join returned it. */
export function stripMtssRef(row: FlattenedMtss): Omit<FlattenedMtss, 'student'> {
  const clone = { ...row };
  delete (clone as Partial<FlattenedMtss>).student;
  return { ...clone, tier_history: parseJsonColumn<unknown>(clone.tier_history) };
}

// ---------------------------------------------------------------------------
// Coercion helpers (node-postgres silently coerced these for the old handlers)
// ---------------------------------------------------------------------------

/** undefined/null/'' → null (pg wrote NULL); numbers and numeric strings → number. */
export function toIntOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** undefined/null → null; otherwise Boolean(value) (pg coerced to boolean). */
export function toBoolOrNull(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  return Boolean(value);
}

/** Parse a `YYYY-MM-DD` string (UTC) — returns null for junk, like pg's cast. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today as a UTC `YYYY-MM-DD` string (SQLite text dates compare lexically). */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` plus `days`, as a UTC `YYYY-MM-DD` string. */
export function datePlusDaysStr(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ISO string for the Monday of the week containing `dateStr` (pg DATE_TRUNC('week')). */
export function mondayOfWeek(dateStr: string): string | null {
  const d = parseDateOnly(dateStr);
  if (!d) return null;
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString();
}

/** Group counts by key preserving first-seen order (pg GROUP BY has no order). */
export function groupCounts<T extends string | number>(values: T[]): Array<{ key: T; count: number }> {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}
