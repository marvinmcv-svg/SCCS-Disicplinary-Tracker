// Shared helpers for learning-support plans, recognitions and early-warning
// insights.
import type { Accommodations, Students, SupportPlans } from '@prisma/client';

type PlanWithRefs = SupportPlans & { student?: Students | null; accommodations?: Accommodations[] };

/** Flatten a plan row with the student columns the SPA lists show. */
export function serializePlan(row: PlanWithRefs) {
  const { student, accommodations, ...plan } = row;
  return {
    ...plan,
    first_name: student?.first_name ?? '',
    last_name: student?.last_name ?? '',
    student_code: student?.student_id ?? '',
    grade: student?.grade ?? null,
    section: student?.section ?? null,
    profile_picture: student?.profile_picture ?? null,
    accommodations: accommodations ?? [],
  };
}

/** IDEA: removals totalling more than 10 school days in a year trigger a
 *  manifestation determination review (MDR) for students with disabilities.
 *  We warn from day 8 so teams can convene before the threshold. */
export const MDR_THRESHOLD_DAYS = 10;
export const MDR_WARNING_DAYS = 8;

/** Plan types protected by IDEA / Section 504 discipline safeguards. */
export const PROTECTED_PLAN_TYPES = new Set(['IEP', '504']);

/** Start of the current school year (Aug 1) as YYYY-MM-DD. */
export function schoolYearStart(today = new Date()): string {
  const y = today.getUTCMonth() >= 7 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  return `${y}-08-01`;
}
