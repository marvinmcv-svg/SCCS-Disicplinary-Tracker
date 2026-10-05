// /api/codes/[id] — update / delete a single PlusPortals discipline code
// (admin only). Deleting is refused while any incident still carries the code
// value, so historical referrals never lose their SIS coding — deactivate
// instead in that case.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, adminOnly, forbidden } from '@/lib/sccs-auth';
import { disciplineCodeUpdateSchema, parseBody } from '@/lib/sccs-validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(async (req, user, ctx) => {
  try {
    if (!adminOnly(user)) return forbidden();

    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json({ error: 'Invalid code id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = parseBody(disciplineCodeUpdateSchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.response, { status: 400 });
    }
    const d = parsed.data;

    const existing = await db.disciplineCodes.findUnique({ where: { id: numericId } });
    if (!existing) {
      return NextResponse.json({ error: 'Code not found' }, { status: 404 });
    }
    if (d.code !== undefined && d.code !== existing.code) {
      const dup = await db.disciplineCodes.findUnique({
        where: { group_code: { group: existing.group, code: d.code } },
      });
      if (dup) {
        return NextResponse.json(
          { error: `Code ${d.code} already exists in the ${existing.group} set` },
          { status: 409 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (d.code !== undefined) data.code = d.code;
    if (d.name !== undefined) data.name = d.name;
    if (d.description !== undefined) data.description = d.description;
    if (d.detention_hours !== undefined) data.detention_hours = d.detention_hours;
    if (d.days_iss !== undefined) data.days_iss = d.days_iss;
    if (d.days_oss !== undefined) data.days_oss = d.days_oss;
    if (d.active !== undefined) data.active = d.active;
    if (d.sort_order !== undefined) data.sort_order = d.sort_order;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const row = await db.disciplineCodes.update({ where: { id: numericId }, data });
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});

export const DELETE = withAuth<Ctx>(async (_req, user, ctx) => {
  try {
    if (!adminOnly(user)) return forbidden();

    const { id } = await ctx.params;
    const numericId = Number.parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return NextResponse.json({ error: 'Invalid code id' }, { status: 400 });
    }

    const existing = await db.disciplineCodes.findUnique({ where: { id: numericId } });
    if (!existing) {
      return NextResponse.json({ error: 'Code not found' }, { status: 404 });
    }

    // The combined value stored on incidents (e.g. "DET — Detention").
    const value = `${existing.code} — ${existing.name}`;
    const inUse =
      existing.group === 'penalty'
        ? await db.incidents.count({ where: { penalty: value } })
        : existing.group === 'served'
          ? await db.incidents.count({ where: { penalty_served: value } })
          : existing.group === 'location'
            ? await db.incidents.count({ where: { location: value } })
            : await db.incidents.count({ where: { action_taken: value } });
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: `${existing.group === 'location' ? 'Location' : existing.group === 'served' ? 'Served status' : existing.group === 'penalty' ? 'Penalty' : 'Action'} code ${existing.code} is used by ${inUse} incident${inUse === 1 ? '' : 's'} and cannot be deleted — deactivate it instead.`,
        },
        { status: 409 },
      );
    }

    await db.disciplineCodes.delete({ where: { id: numericId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
});
