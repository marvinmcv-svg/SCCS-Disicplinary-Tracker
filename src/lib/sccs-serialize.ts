// Row-shaping helpers so API responses match the original Express/pg joined
// rows exactly (flat fields like last_name, violation_type at top level).

import type { Incidents, Students, Violations, MtssInterventions } from '@prisma/client';

type IncidentWithRefs = Incidents & {
  student?: Students | null;
  violation?: Violations | null;
};

/** Flatten an incident + joined student/violation into the original row shape. */
export function flattenIncident(row: IncidentWithRefs) {
  const s = row.student;
  const v = row.violation;
  return {
    ...row,
    last_name: s?.last_name ?? '',
    first_name: s?.first_name ?? '',
    student_id_raw: s?.student_id ?? '',
    grade: s?.grade ?? null,
    counselor: s?.counselor ?? null,
    advisory: s?.advisory ?? null,
    violation_type: v?.violation_type ?? '',
    category: v?.category ?? '',
    student: undefined,
    violation: undefined,
  };
}

type MtssWithStudent = MtssInterventions & {
  student?: Students | null;
};

export function flattenMtss(row: MtssWithStudent) {
  const s = row.student;
  return {
    ...row,
    last_name: s?.last_name ?? '',
    first_name: s?.first_name ?? '',
    student: undefined,
  };
}
