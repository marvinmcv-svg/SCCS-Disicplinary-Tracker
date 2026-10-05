// /api/incidents/[id] — port of sccs/server/routes/index.ts:566 (GET),
// 628 (PUT) and 678 (DELETE).
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withAuth, canRecordIncidents, adminOnly, forbidden } from '@/lib/sccs-auth';
import { incidentUpdateSchema, parseBody } from '@/lib/sccs-validation';
import { flattenIncident } from '@/lib/sccs-serialize';
import { stripIncidentRefs } from '../../_lib/api-utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET — flattened incident with the student's grade too; res.json(null) when
// the row does not exist (queryOne semantics).
export const GET = withAuth<Ctx>(async (_req, _user, ctx) => {
  try {
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json(null);
    }
    const row = await db.incidents.findUnique({
      where: { id: numericId },
      include: { student: true, violation: true },
    });
    if (!row) {
      return NextResponse.json(null);
    }
    return NextResponse.json(stripIncidentRefs(flattenIncident(row)));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});

// PUT — partial update: absent keys leave the column untouched, null clears it.
export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!canRecordIncidents(user)) return forbidden();

    const body = await req.json().catch(() => null);
    const parsed = parseBody(incidentUpdateSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }
    const d = parsed.data;
    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Build the update object ONLY from present keys.
    const data: Prisma.IncidentsUpdateManyInput = {};

    if (d.status !== undefined) {
      // Log status change
      const incident = await db.incidents.findUnique({
        where: { id: numericId },
        select: { status: true },
      });
      if (incident && incident.status !== d.status) {
        await db.incidentStatusLogs.create({
          data: {
            incident_id: numericId,
            changed_by: user.userId,
            previous_status: incident.status,
            new_status: d.status,
          },
        });
      }
      data.status = d.status;
    }
    if (d.parent_contacted !== undefined) data.parent_contacted = d.parent_contacted;
    if (d.contact_date !== undefined) data.contact_date = d.contact_date;
    if (d.location !== undefined) data.location = d.location;
    if (d.description !== undefined) data.description = d.description;
    if (d.witnesses !== undefined) data.witnesses = d.witnesses;
    if (d.reported_by !== undefined) data.reported_by = d.reported_by;
    if (d.action_taken !== undefined) data.action_taken = d.action_taken;
    if (d.consequence !== undefined) data.consequence = d.consequence;
    if (d.penalty !== undefined) data.penalty = d.penalty;
    if (d.penalty_served !== undefined) data.penalty_served = d.penalty_served;
    if (d.days_iss !== undefined) data.days_iss = d.days_iss;
    if (d.days_oss !== undefined) data.days_oss = d.days_oss;
    if (d.detention_hours !== undefined) data.detention_hours = d.detention_hours;
    if (d.notes !== undefined) data.notes = d.notes;
    if (d.follow_up_needed !== undefined) data.follow_up_needed = d.follow_up_needed;
    if (d.follow_up_date !== undefined) data.follow_up_date = d.follow_up_date;
    if (d.resolved_date !== undefined) data.resolved_date = d.resolved_date;
    // `advisor` is accepted by the schema but the ported Incidents model has
    // no such column — the update is dropped, like the seed agent's note.
    if (d.violation_id !== undefined) data.violation_id = d.violation_id;
    if (d.points_deducted !== undefined) data.points_deducted = d.points_deducted;

    // Keep penalty ↔ served consistent on partial updates: a penalty set
    // without a served status starts as PEND — Pending; a cleared penalty
    // clears its served status too.
    if (d.penalty !== undefined && d.penalty_served === undefined) {
      if (d.penalty === null) {
        data.penalty_served = null;
      } else {
        const current = await db.incidents.findUnique({
          where: { id: numericId },
          select: { penalty_served: true },
        });
        if (!current?.penalty_served) data.penalty_served = 'PEND — Pending';
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await db.incidents.updateMany({ where: { id: numericId }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});

// DELETE — admin only.
export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!adminOnly(user)) return forbidden();

    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (!Number.isNaN(numericId)) {
      await db.incidents.deleteMany({ where: { id: numericId } });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
