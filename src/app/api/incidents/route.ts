// /api/incidents — port of sccs/server/routes/index.ts:532 (GET) and 582 (POST).
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth, canRecordIncidents, forbidden } from '@/lib/sccs-auth';
import { incidentSchema, parseBody } from '@/lib/sccs-validation';
import { flattenIncident } from '@/lib/sccs-serialize';
import { stripIncidentRefs } from '../_lib/api-utils';

export const dynamic = 'force-dynamic';

// GET — joined student/violation rows flattened to the original query shape.
// RBAC: teachers/counselors only see incidents they reported OR involving
// students they counsel or advise.
export const GET = withAuth(async (_req, user) => {
  try {
    const userRole = user.role || 'user'; // default to most-restricted

    const where: Prisma.IncidentsWhereInput = {};
    if (userRole === 'teacher' || userRole === 'counselor') {
      // Look up the current user's full name + assigned advisory room.
      const currentUserData = await db.users.findUnique({
        where: { id: user.userId },
        select: { first_name: true, last_name: true, advisory: true },
      });
      const fullName = currentUserData
        ? `${currentUserData.first_name} ${currentUserData.last_name}`
        : '';
      // See: incidents they reported OR where they're the counselor/advisory.
      // users.advisory holds the staff member's advisory ROOM label
      // ("Rm 13 - Ms Robinson") and students.advisory uses the same labels, so
      // matching the room lets an advisory teacher see their own students'
      // referrals (the original SQL matched only the full name against
      // s.advisory, which never matched the room-label format).
      where.OR = [
        { reported_by: fullName },
        { student: { counselor: fullName } },
        { student: { advisory: fullName } },
      ];
      if (currentUserData?.advisory) {
        where.OR.push({ student: { advisory: currentUserData.advisory } });
      }
    }

    const rows = await db.incidents.findMany({
      where,
      include: { student: true, violation: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json(rows.map((row) => stripIncidentRefs(flattenIncident(row))));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// POST — create an incident (admin/principal/counselor/teacher only).
export const POST = withAuth(async (req, user) => {
  try {
    if (!canRecordIncidents(user)) return forbidden();

    const body = await req.json().catch(() => null);
    const parsed = parseBody(incidentSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }
    const d = parsed.data;

    // Per-day human id: YYMMDD-### — count existing rows with this prefix.
    // (Number() avoids the original's bigint-string "5"+1="51" bug.)
    const datePrefix = d.date.replace(/-/g, '').slice(2);
    const count = await db.incidents.count({
      where: { incident_id: { startsWith: datePrefix } },
    });
    const incidentId = `${datePrefix}-${String(count + 1).padStart(3, '0')}`;

    const violation = await db.violations.findUnique({ where: { id: d.violation_id } });

    // PlusPortals penalty code: when the referral carries one, the penalty's
    // default quantities pre-fill any numeric field the caller did not send,
    // the consequence falls back to the penalty's plain name, and an unserved
    // penalty starts life as PEND — Pending (the SIS does the same).
    let penalty = d.penalty ?? null;
    let penaltyServed = d.penalty_served ?? null;
    let detentionHours = d.detention_hours;
    let daysIss = d.days_iss;
    let daysOss = d.days_oss;
    let consequence = d.consequence ?? violation?.default_consequence ?? null;
    if (penalty) {
      const codePart = penalty.split(' — ')[0];
      const code = await db.disciplineCodes.findUnique({
        where: { group_code: { group: 'penalty', code: codePart } },
      });
      if (code) {
        if (detentionHours === undefined) detentionHours = code.detention_hours;
        if (daysIss === undefined) daysIss = code.days_iss;
        if (daysOss === undefined) daysOss = code.days_oss;
        if (!consequence) consequence = code.name;
        if (!penaltyServed) penaltyServed = 'PEND — Pending';
      }
    }

    await db.incidents.create({
      data: {
        incident_id: incidentId,
        date: d.date,
        time: d.time ?? null,
        student_id: d.student_id,
        violation_id: d.violation_id,
        location: d.location ?? null,
        description: d.description,
        witnesses: d.witnesses ?? null,
        reported_by: d.reported_by ?? null,
        // NOTE: the ported Incidents model has no `advisor` column (see the
        // seed agent's worklog note), so the original's advisor insert is
        // dropped here — the value is simply not persisted.
        action_taken: d.action_taken ?? null,
        consequence,
        penalty,
        penalty_served: penaltyServed,
        points_deducted: violation?.points_deduction || -2,
        days_iss: daysIss ?? 0,
        days_oss: daysOss !== undefined ? daysOss : (violation?.max_oss_days || 0),
        detention_hours: detentionHours ?? 0,
        administrator_id: user.userId,
        notes: d.notes ?? null,
        follow_up_needed: 'No',
        follow_up_date: null,
        parent_contacted: 'No',
        contact_date: null,
      },
    });
    // The STRING incident id, not the numeric primary key.
    return NextResponse.json({ id: incidentId });
  } catch (error) {
    // e.g. FK violation for a non-existent student/violation, duplicate
    // incident_id — the original also answered 400 here.
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
