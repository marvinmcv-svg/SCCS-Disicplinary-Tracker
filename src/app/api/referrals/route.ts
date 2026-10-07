// /api/referrals — Secondary Disciplinary Referrals.
// GET: coordinators see every referral; any other staff member sees only the
// referrals they filed themselves (read-only).
// POST: any staff member files a referral; every active coordinator with an
// email address is notified (see src/lib/mailer.ts).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withAuth, canFileReferrals, canViewReferrals, forbidden, getUserRow } from '@/lib/sccs-auth';
import { parseBody } from '@/lib/sccs-validation';
import { sendMail, escapeHtml } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const text = (max: number) => z.string().trim().min(1, 'Please answer every question').max(max);

const referralSchema = z.object({
  student_ids: z.array(z.number().int().positive()).min(1, 'Choose at least one student').max(20),
  incident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  strengths: text(5000),
  situation: text(10000),
  strategies_used: text(10000),
  suggestions: text(10000),
});

export const GET = withAuth(async (req: NextRequest, user) => {
  const coordinator = canViewReferrals(user);
  if (!coordinator && !canFileReferrals(user)) return forbidden('Referrals are visible to coordinators only');
  const status = req.nextUrl.searchParams.get('status');
  const referrals = await db.disciplinaryReferrals.findMany({
    where: {
      ...(status && status !== 'all' ? { status } : {}),
      ...(coordinator ? {} : { submitted_by: user.userId }),
    },
    orderBy: { created_at: 'desc' },
    take: 500,
  });
  // The filer sees their own referral, not the coordinators' notes on it.
  return NextResponse.json(coordinator ? referrals : referrals.map((r) => ({ ...r, coordinator_notes: null })));
});

export const POST = withAuth(async (req: NextRequest, user) => {
  if (!canFileReferrals(user)) return forbidden();
  const parsed = parseBody(referralSchema, await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json(parsed.response, { status: 400 });
  const data = parsed.data;

  const students = await db.students.findMany({
    where: { id: { in: data.student_ids } },
    select: { id: true, first_name: true, last_name: true, student_id: true, grade: true },
  });
  if (students.length !== new Set(data.student_ids).size) {
    return NextResponse.json({ error: 'One of the students could not be found' }, { status: 400 });
  }
  const filer = await getUserRow(user.userId);
  const filerName = [filer?.first_name, filer?.last_name].filter(Boolean).join(' ').trim() || filer?.username || 'Staff';
  const studentNames = students
    .map((s) => `${s.first_name} ${s.last_name} (${s.student_id}, Grade ${s.grade})`)
    .join('; ');

  const referral = await db.disciplinaryReferrals.create({
    data: {
      student_ids: students.map((s) => s.id),
      student_names: studentNames,
      incident_date: data.incident_date ?? null,
      strengths: data.strengths,
      situation: data.situation,
      strategies_used: data.strategies_used,
      suggestions: data.suggestions,
      submitted_by: user.userId,
      submitted_by_name: filerName,
    },
  });

  // Notify coordinators. The email carries who and when, not the narrative:
  // the full referral stays inside the app, behind the coordinator login.
  const coordinators = await db.users.findMany({
    where: { role: 'coordinator', is_active: true },
    select: { email: true },
  });
  const to = coordinators.map((c) => (c.email ?? '').trim()).filter(Boolean);
  const link = `${req.nextUrl.origin}/#/referrals?id=${referral.id}`;
  const subject = `Nueva remisión disciplinaria / New disciplinary referral #${referral.id}`;
  const textBody =
    `Se registró una nueva Remisión Disciplinaria de Secundaria.\n` +
    `Estudiante(s): ${studentNames}\nEnviada por: ${filerName}\n` +
    `Fecha del incidente: ${data.incident_date ?? 'No indicada'}\nAbrir: ${link}\n\n` +
    `A new Secondary Disciplinary Referral was filed.\n` +
    `Student(s): ${studentNames}\nFiled by: ${filerName}\n` +
    `Incident date: ${data.incident_date ?? 'Not given'}\nOpen: ${link}\n`;
  const html =
    `<p><strong>Nueva Remisión Disciplinaria de Secundaria</strong></p>` +
    `<p>Estudiante(s): ${escapeHtml(studentNames)}<br>Enviada por: ${escapeHtml(filerName)}<br>` +
    `Fecha del incidente: ${escapeHtml(data.incident_date ?? 'No indicada')}</p>` +
    `<hr><p><strong>New Secondary Disciplinary Referral</strong></p>` +
    `<p>Student(s): ${escapeHtml(studentNames)}<br>Filed by: ${escapeHtml(filerName)}<br>` +
    `Incident date: ${escapeHtml(data.incident_date ?? 'Not given')}</p>` +
    `<p><a href="${escapeHtml(link)}">Abrir la remisión / Open the referral</a></p>`;
  const emailStatus = to.length === 0 ? 'no_recipients' : await sendMail({ to, subject, text: textBody, html });

  await db.disciplinaryReferrals.update({ where: { id: referral.id }, data: { email_status: emailStatus } });
  await db.userActivityLog
    .create({ data: { user_id: user.userId, action: 'FILE_REFERRAL', details: `Referral #${referral.id}` } })
    .catch(() => {});

  // The filer gets a receipt, not the stored record.
  return NextResponse.json({ id: referral.id, email_status: emailStatus, coordinators_notified: emailStatus === 'sent' ? to.length : 0 }, { status: 201 });
});
