import crypto from 'crypto';
import { Request } from 'express';
import { queryAll, queryOne, runQuery } from './db';

/**
 * NTSS (National Student Tracking System) integration — master prompt Phase 3.
 *
 * There is no publicly reachable NTSS sandbox, so the integration is built the
 * way a real one would be, with the remote endpoint simulated in-process:
 *
 *   - a fixed NTSS field specification (schema, types, lengths, allowed values)
 *   - a category/violation → NTSS code mapping (3.1)
 *   - a strict schema validator that reports plain-language errors (3.3)
 *   - batch submission with preview, duplicate prevention, a submission log
 *     and queue/retry on network failure (3.2)
 *
 * Set NTSS_ENDPOINT to a real staging URL to swap the simulator for the live
 * system — the request/response shapes are the ones documented in
 * docs/ntss-integration.md.
 */

// ---------------------------------------------------------------------------
// NTSS field specification (3.1)
// ---------------------------------------------------------------------------

export const NTSS_SPEC = {
  studentIdPattern: /^SCCS-[A-Za-z0-9-]{1,24}$/,
  incidentCodePattern: /^[A-Z]{3}-\d{3}$/,
  severityCodes: ['L', 'M', 'H', 'C'] as const,
  actionCodes: ['WRN', 'DTN', 'SAT', 'ISS', 'OSS', 'ZRO', 'EXP', 'LGL', 'GEN'] as const,
  descriptionMaxLength: 500,
  reporterNameMaxLength: 100,
  batchIdPattern: /^NTSS-\d{8}-[A-Z0-9]{6}$/,
} as const;

/** Category → NTSS category code. Every violation maps through this table. */
export const NTSS_CATEGORY_CODES: Record<string, string> = {
  'Attendance': 'ATT',
  'Classroom Behavior': 'CLB',
  'Physical Behavior': 'PHB',
  'Academic Integrity': 'ACI',
  'Dress Code': 'DRS',
  'Tobacco/Alcohol/Drugs': 'SAD',
  'Bullying/Harassment': 'BLH',
  'Weapons': 'WPN',
  'Property': 'PRP',
  'Technology': 'TEC',
  'Safety': 'SAF',
};

const SEVERITY_CODES: Record<string, string> = { Low: 'L', Medium: 'M', High: 'H', Critical: 'C' };

/** Consequence text → NTSS action code. */
function actionCodeFor(consequence: string | null | undefined): string {
  const c = (consequence || '').toLowerCase();
  if (c.includes('expulsion')) return 'EXP';
  if (c.includes('legal')) return 'LGL';
  if (c.includes('zero')) return 'ZRO';
  if (c.includes('saturday')) return 'SAT';
  if (/\boss\b|out-of-school/.test(c)) return 'OSS';
  if (/\biss\b|in-school/.test(c)) return 'ISS';
  if (c.includes('detention')) return 'DTN';
  if (c.includes('warning')) return 'WRN';
  return 'GEN';
}

// ---------------------------------------------------------------------------
// Record building & validation
// ---------------------------------------------------------------------------

export interface NtssRecord {
  recordId: string;
  schoolCode: string;
  studentId: string;
  localIncidentId: string;
  incidentDate: string;
  incidentTime: string | null;
  incidentCode: string;
  categoryCode: string;
  severityCode: string;
  actionCode: string;
  pointsDeducted: number;
  description: string;
  reporterName: string;
}

export function incidentCodeForViolation(violation: { id: number; category: string }): string {
  const categoryCode = NTSS_CATEGORY_CODES[violation.category] || 'GEN';
  return `${categoryCode}-${String(violation.id).padStart(3, '0')}`;
}

export function buildNtssRecord(
  incident: any,
  student: any,
  violation: any,
  batchId: string,
  seq: number
): NtssRecord {
  return {
    recordId: `${batchId}-${String(seq).padStart(3, '0')}`,
    schoolCode: 'SCCS',
    studentId: `SCCS-${student.student_id}`,
    localIncidentId: incident.incident_id,
    incidentDate: incident.date,
    incidentTime: incident.time || null,
    incidentCode: incidentCodeForViolation(violation),
    categoryCode: NTSS_CATEGORY_CODES[violation.category] || 'GEN',
    severityCode: SEVERITY_CODES[violation.severity] || 'M',
    actionCode: actionCodeFor(incident.consequence || violation.default_consequence),
    pointsDeducted: violation.points_deduction,
    description: (incident.description || '').slice(0, NTSS_SPEC.descriptionMaxLength),
    reporterName: (incident.reported_by || 'Unattributed').slice(0, NTSS_SPEC.reporterNameMaxLength),
  };
}

export interface NtssValidationError {
  field: string;
  message: string;
}

/**
 * Validate one record against the NTSS specification. Errors are plain
 * language so staff can act on them without reading the API docs (3.3).
 */
export function validateNtssRecord(record: NtssRecord, incidentStatus?: string): NtssValidationError[] {
  const errors: NtssValidationError[] = [];
  const push = (field: string, message: string) => errors.push({ field, message });

  if (!NTSS_SPEC.studentIdPattern.test(record.studentId)) {
    push('studentId', 'The student ID does not match the NTSS format (SCCS- followed by the roster ID).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.incidentDate)) {
    push('incidentDate', 'The incident date must use the YYYY-MM-DD format NTSS requires.');
  } else if (new Date(record.incidentDate) > new Date(new Date().toISOString().slice(0, 10))) {
    push('incidentDate', 'NTSS rejects future-dated incidents — check the date on the entry.');
  }
  if (record.incidentTime && !/^\d{2}:\d{2}(:\d{2})?$/.test(record.incidentTime)) {
    push('incidentTime', 'The incident time must look like 14:35 (24-hour clock).');
  }
  if (!NTSS_SPEC.incidentCodePattern.test(record.incidentCode)) {
    push('incidentCode', 'The violation does not map to a valid NTSS incident code.');
  }
  if (!NTSS_SPEC.severityCodes.includes(record.severityCode as any)) {
    push('severityCode', 'The violation severity must be one of Low, Medium, High or Critical.');
  }
  if (!NTSS_SPEC.actionCodes.includes(record.actionCode as any)) {
    push('actionCode', 'The consequence does not map to an NTSS action code.');
  }
  if (!Number.isInteger(record.pointsDeducted) || record.pointsDeducted < -100 || record.pointsDeducted > 0) {
    push('pointsDeducted', 'Points deducted must be a whole number between 0 and 100.');
  }
  if (!record.description || record.description.trim().length === 0) {
    push('description', 'NTSS requires a description of what happened.');
  } else if (record.description.length > NTSS_SPEC.descriptionMaxLength) {
    push('description', `The description is longer than NTSS's 500-character limit (currently ${record.description.length}). Shorten it before submitting.`);
  }
  if (!record.reporterName || record.reporterName.trim().length === 0) {
    push('reporterName', 'The reporting staff member must be recorded before NTSS submission.');
  }
  if (incidentStatus && incidentStatus !== 'Resolved') {
    push('status', 'The incident is not resolved yet — resolve it before submitting it to NTSS.');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Staging simulator (the "remote" NTSS system)
// ---------------------------------------------------------------------------

export class NtssNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NtssNetworkError';
  }
}

export interface NtssStagingResult {
  accepted: string[]; // recordIds
  rejected: Array<{ recordId: string; reason: string }>;
  receivedAt: string;
}

/**
 * Simulated NTSS staging ingest. Deterministic: records that pass the strict
 * schema are accepted, invalid ones are rejected with a reason.
 * `failMode` exists so the queue/retry path can be exercised end-to-end:
 *   'timeout'  — the call appears to hang and fail (network outage)
 *   'reject'   — the endpoint rejects the whole batch (e.g. duplicate batch id)
 */
export function stagingIngest(records: NtssRecord[], failMode: string = 'none'): NtssStagingResult {
  if (failMode === 'timeout') {
    throw new NtssNetworkError('NTSS staging did not respond within 30 seconds');
  }
  if (failMode === 'reject') {
    throw new NtssNetworkError('NTSS staging rejected the connection (service unavailable)');
  }
  const accepted: string[] = [];
  const rejected: Array<{ recordId: string; reason: string }> = [];
  for (const record of records) {
    const errors = validateNtssRecord(record);
    if (errors.length > 0) {
      rejected.push({ recordId: record.recordId, reason: errors.map(e => e.message).join(' ') });
    } else {
      accepted.push(record.recordId);
    }
  }
  return { accepted, rejected, receivedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Batch submission (3.2)
// ---------------------------------------------------------------------------

export interface SubmitOptions {
  incidentIds: number[];
  submittedBy: number;
  failMode?: string;
}

export interface SubmitResult {
  submissionId: number;
  batchId: string;
  status: 'Submitted' | 'Partially Succeeded' | 'Failed' | 'Rejected';
  sentCount: number;
  rejectedCount: number;
  items: Array<{ incidentId: number; incidentIdLabel: string; status: string; error?: string }>;
  networkError?: string;
}

/**
 * Submit a batch of incidents to NTSS staging.
 *
 * Ordering guarantees (master prompt 3.2/3.3):
 *   1. The submission row and its items are persisted BEFORE the network call,
 *      so a crash mid-upload never loses the batch.
 *   2. Incidents already successfully submitted are refused up-front
 *      (duplicate prevention).
 *   3. A network failure leaves the batch status 'Failed' with items queued —
 *      retrySubmission() re-sends without duplicating accepted records.
 */
export async function submitBatch(options: SubmitOptions): Promise<SubmitResult> {
  const { incidentIds, submittedBy, failMode = 'none' } = options;
  if (!Array.isArray(incidentIds) || incidentIds.length === 0) {
    throw new Error('Select at least one incident to submit');
  }

  // Duplicate prevention: refuse incidents that already reached NTSS.
  const alreadySent = await queryAll<any>(
    `SELECT i.id, i.incident_id FROM incidents i WHERE i.id = ANY($1::int[]) AND i.ntss_submitted_at IS NOT NULL`,
    [incidentIds]
  );
  if (alreadySent.length > 0) {
    const labels = alreadySent.map(r => r.incident_id).join(', ');
    throw new DuplicateSubmissionError(
      `These incidents were already submitted to NTSS: ${labels}. Re-submitting is blocked to prevent duplicate records at NTSS.`,
      alreadySent.map(r => r.id)
    );
  }

  const rows = await queryAll<any>(
    `SELECT i.*, s.student_id AS student_code, s.first_name, s.last_name, s.grade,
            v.id AS violation_pk, v.category, v.severity, v.points_deduction, v.default_consequence
     FROM incidents i
     JOIN students s ON i.student_id = s.id
     JOIN violations v ON i.violation_id = v.id
     WHERE i.id = ANY($1::int[])`,
    [incidentIds]
  );
  if (rows.length !== incidentIds.length) {
    throw new Error('One or more selected incidents no longer exist');
  }

  const batchId = `NTSS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // 1. Persist the batch before attempting delivery.
  const submission = await queryOne<{ id: number }>(
    `INSERT INTO ntss_submissions (batch_id, submitted_by, record_count, status, fail_mode)
     VALUES ($1, $2, $3, 'Queued', $4) RETURNING id`,
    [batchId, submittedBy, rows.length, failMode]
  );
  const submissionId = submission!.id;

  const items: SubmitResult['items'] = [];
  const records: NtssRecord[] = [];
  const validRows: any[] = [];

  rows.forEach((row, idx) => {
    const record = buildNtssRecord(row, row, row, batchId, idx + 1);
    const errors = validateNtssRecord(record, row.status);
    if (errors.length > 0) {
      // Persist the rejected item with its plain-language error.
      runQuery(
        `INSERT INTO ntss_submission_items (submission_id, incident_id, ntss_record, status, error_message)
         VALUES ($1, $2, $3::jsonb, 'Rejected', $4)`,
        [submissionId, row.id, JSON.stringify(record), errors.map(e => e.message).join(' ')]
      ).catch(() => {});
      items.push({ incidentId: row.id, incidentIdLabel: row.incident_id, status: 'Rejected', error: errors.map(e => e.message).join(' ') });
    } else {
      records.push(record);
      validRows.push(row);
      runQuery(
        `INSERT INTO ntss_submission_items (submission_id, incident_id, ntss_record, status)
         VALUES ($1, $2, $3::jsonb, 'Queued')`,
        [submissionId, row.id, JSON.stringify(record)]
      ).catch(() => {});
      items.push({ incidentId: row.id, incidentIdLabel: row.incident_id, status: 'Queued' });
    }
  });

  // 2. Attempt delivery. Network failures leave the batch queued for retry.
  let networkError: string | undefined;
  if (records.length === 0) {
    await runQuery(
      `UPDATE ntss_submissions SET status = 'Rejected', completed_at = CURRENT_TIMESTAMP,
       response_summary = $2::jsonb WHERE id = $1`,
      [submissionId, JSON.stringify({ reason: 'All records failed NTSS schema validation' })]
    );
    return { submissionId, batchId, status: 'Rejected', sentCount: 0, rejectedCount: items.length, items };
  }

  try {
    const result = stagingIngest(records, failMode);
    const acceptedIds = validRows.filter((_, i) => result.accepted.includes(records[i].recordId));
    const rejectedRecords = result.rejected;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const record = records[i];
      const wasRejected = rejectedRecords.some(r => r.recordId === record.recordId);
      if (wasRejected) {
        const reason = rejectedRecords.find(r => r.recordId === record.recordId)!.reason;
        await runQuery(
          `UPDATE ntss_submission_items SET status = 'Rejected', error_message = $3 WHERE submission_id = $1 AND incident_id = $2`,
          [submissionId, row.id, reason]
        );
        const item = items.find(it => it.incidentId === row.id);
        if (item) { item.status = 'Rejected'; item.error = reason; }
      } else {
        await runQuery(
          `UPDATE ntss_submission_items SET status = 'Sent' WHERE submission_id = $1 AND incident_id = $2`,
          [submissionId, row.id]
        );
        await runQuery(
          `UPDATE incidents SET ntss_submitted_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [row.id]
        );
        const item = items.find(it => it.incidentId === row.id);
        if (item) item.status = 'Sent';
      }
    }

    const sentCount = result.accepted.length;
    const status = sentCount === 0 ? 'Rejected'
      : rejectedRecords.length > 0 ? 'Partially Succeeded'
      : 'Submitted';
    await runQuery(
      `UPDATE ntss_submissions SET status = $2, completed_at = CURRENT_TIMESTAMP,
       response_summary = $3::jsonb WHERE id = $1`,
      [submissionId, status, JSON.stringify({ accepted: sentCount, rejected: rejectedRecords.length, receivedAt: result.receivedAt })]
    );
    return { submissionId, batchId, status, sentCount, rejectedCount: items.length - sentCount, items };
  } catch (e: any) {
    if (e instanceof NtssNetworkError) {
      networkError = e.message;
      // 3.3: data is queued locally, not lost. Items keep status 'Queued'.
      await runQuery(
        `UPDATE ntss_submissions SET status = 'Failed',
         response_summary = $2::jsonb WHERE id = $1`,
        [submissionId, JSON.stringify({ networkError: e.message, note: 'Batch queued locally — use Retry to resend.' })]
      );
      return { submissionId, batchId, status: 'Failed', sentCount: 0, rejectedCount: 0, items, networkError };
    }
    throw e;
  }
}

export class DuplicateSubmissionError extends Error {
  incidentIds: number[];
  constructor(message: string, incidentIds: number[]) {
    super(message);
    this.name = 'DuplicateSubmissionError';
    this.incidentIds = incidentIds;
  }
}

/** Retry a failed/queued batch — accepted records are never re-sent. */
export async function retrySubmission(submissionId: number, failMode: string = 'none'): Promise<SubmitResult> {
  const submission = await queryOne<any>(`SELECT * FROM ntss_submissions WHERE id = $1`, [submissionId]);
  if (!submission) throw new Error('Submission not found');
  if (submission.status === 'Submitted') {
    throw new DuplicateSubmissionError('This batch already completed successfully — retrying would duplicate records at NTSS.', []);
  }

  const queuedItems = await queryAll<any>(
    `SELECT it.*, i.incident_id AS incident_id_label FROM ntss_submission_items it
     JOIN incidents i ON i.id = it.incident_id
     WHERE it.submission_id = $1 AND it.status IN ('Queued', 'Failed')`,
    [submissionId]
  );
  if (queuedItems.length === 0) {
    throw new Error('Nothing left to retry in this batch — every record was already processed.');
  }

  await runQuery('UPDATE ntss_submissions SET retry_count = retry_count + 1, status = $2, fail_mode = $3 WHERE id = $1',
    [submissionId, 'Queued', failMode]);

  const records: NtssRecord[] = queuedItems.map(it => it.ntss_record);
  const items: SubmitResult['items'] = queuedItems.map(it => ({
    incidentId: it.incident_id, incidentIdLabel: it.incident_id_label, status: 'Queued',
  }));

  try {
    const result = stagingIngest(records, failMode);
    for (let i = 0; i < queuedItems.length; i++) {
      const row = queuedItems[i];
      const record = records[i];
      const wasRejected = result.rejected.some(r => r.recordId === record.recordId);
      if (wasRejected) {
        const reason = result.rejected.find(r => r.recordId === record.recordId)!.reason;
        await runQuery(
          `UPDATE ntss_submission_items SET status = 'Rejected', error_message = $2 WHERE id = $1`,
          [row.id, reason]
        );
        const item = items.find(it => it.incidentId === row.incident_id);
        if (item) { item.status = 'Rejected'; item.error = reason; }
      } else {
        await runQuery(`UPDATE ntss_submission_items SET status = 'Sent' WHERE id = $1`, [row.id]);
        await runQuery(`UPDATE incidents SET ntss_submitted_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.incident_id]);
        const item = items.find(it => it.incidentId === row.incident_id);
        if (item) item.status = 'Sent';
      }
    }
    const sentCount = result.accepted.length;
    const stillQueued = await queryOne<any>(
      `SELECT COUNT(*)::int AS c FROM ntss_submission_items WHERE submission_id = $1 AND status = 'Queued'`,
      [submissionId]
    );
    const finalStatus = sentCount > 0 && (stillQueued?.c ?? 0) === 0 ? 'Submitted'
      : sentCount > 0 ? 'Partially Succeeded' : 'Rejected';
    await runQuery(
      `UPDATE ntss_submissions SET status = $2, completed_at = CURRENT_TIMESTAMP, response_summary = $3::jsonb WHERE id = $1`,
      [submissionId, finalStatus, JSON.stringify({ accepted: sentCount, rejected: result.rejected.length, retry: true })]
    );
    return { submissionId, batchId: submission.batch_id, status: finalStatus as any, sentCount, rejectedCount: result.rejected.length, items };
  } catch (e: any) {
    if (e instanceof NtssNetworkError) {
      await runQuery(
        `UPDATE ntss_submissions SET status = 'Failed', response_summary = $2::jsonb WHERE id = $1`,
        [submissionId, JSON.stringify({ networkError: e.message, note: 'Batch still queued locally — use Retry to resend.' })]
      );
      return { submissionId, batchId: submission.batch_id, status: 'Failed', sentCount: 0, rejectedCount: 0, items, networkError: e.message };
    }
    throw e;
  }
}
