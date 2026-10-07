import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { buildParentEmail } from '../src/spa/lib/parentEmail';

/**
 * v2.3: coordinator role, Secondary Disciplinary Referrals (coordinator-only),
 * fingerprint sign-in with passkeys, the bilingual parent email, and that
 * every save lands in the shared database and shows up for other users.
 */

const ADMIN = { username: 'admin', password: 'admin123' };
const TEACHER = { username: 'CarlosP', password: 'Carlos123456!' };
const COORD = { username: 'e2e-coordinator', password: 'Coord!2026x' };

async function token(request: APIRequestContext, who: { username: string; password: string }) {
  const res = await request.post('/api/auth/login', { data: who });
  expect(res.ok(), `login ${who.username}`).toBeTruthy();
  return (await res.json()) as { token: string; user: any };
}

const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

/** Creates the coordinator test account once per run (the seed prunes e2e-* users). */
async function ensureCoordinator(request: APIRequestContext) {
  const admin = await token(request, ADMIN);
  const res = await request.post('/api/users', {
    ...auth(admin.token),
    data: { ...COORD, role: 'coordinator', first_name: 'Cora', last_name: 'Coordinator', email: 'coordinator@example.edu' },
  });
  expect([200, 201, 400]).toContain(res.status());
  return token(request, COORD);
}

async function openAs(page: Page, session: { token: string; user: any }, route: string) {
  await page.goto('/welcome');
  await page.evaluate(([t, u]) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', u);
    localStorage.setItem('sccs_language', 'en');
  }, [session.token, JSON.stringify(session.user)] as const);
  await page.goto(`/#${route}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Coordinator role
// ---------------------------------------------------------------------------
test('coordinators manage accounts and settings, but never admin accounts', async ({ request }) => {
  const coord = await ensureCoordinator(request);
  expect(coord.user.role).toBe('coordinator');

  // Admin-level reads and writes work.
  expect((await request.get('/api/users', auth(coord.token))).ok()).toBeTruthy();
  const settings = await (await request.get('/api/settings', auth(coord.token))).json();
  expect((await request.put('/api/settings', { ...auth(coord.token), data: settings })).ok()).toBeTruthy();

  // ...but admin accounts are off limits, and so is the admin role.
  const users: any[] = await (await request.get('/api/users', auth(coord.token))).json();
  const admin = users.find((u) => u.username === 'admin');
  const edit = await request.put(`/api/users/${admin.id}`, { ...auth(coord.token), data: { ...admin, first_name: 'Hacked' } });
  expect(edit.status()).toBe(403);
  const reset = await request.put(`/api/users/${admin.id}/password`, { ...auth(coord.token), data: { password: 'NewPass!2026' } });
  expect(reset.status()).toBe(403);
  const makeAdmin = await request.post('/api/users', {
    ...auth(coord.token),
    data: { username: 'e2e-should-fail', password: 'Whatever!2026', role: 'admin' },
  });
  expect(makeAdmin.status()).toBe(403);
});

test('deactivated accounts cannot sign in', async ({ request }) => {
  const admin = await token(request, ADMIN);
  const created = await request.post('/api/users', {
    ...auth(admin.token),
    data: { username: 'e2e-leaver', password: 'Leaver!2026', role: 'teacher' },
  });
  expect([200, 201, 400]).toContain(created.status());
  const users: any[] = await (await request.get('/api/users', auth(admin.token))).json();
  const leaver = users.find((u) => u.username === 'e2e-leaver');
  await request.put(`/api/users/${leaver.id}/reactivate`, auth(admin.token));
  expect((await request.post('/api/auth/login', { data: { username: 'e2e-leaver', password: 'Leaver!2026' } })).ok()).toBeTruthy();
  await request.delete(`/api/users/${leaver.id}`, auth(admin.token));
  const denied = await request.post('/api/auth/login', { data: { username: 'e2e-leaver', password: 'Leaver!2026' } });
  expect(denied.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// Secondary Disciplinary Referral
// ---------------------------------------------------------------------------
test('a teacher files a referral; only coordinators can read it', async ({ page, request }) => {
  const coord = await ensureCoordinator(request);
  const teacher = await token(request, TEACHER);
  const admin = await token(request, ADMIN);
  const before = await (await request.get('/api/notifications/count', auth(coord.token))).json();

  await openAs(page, teacher, '/referrals');
  await expect(page.getByRole('heading', { name: 'Secondary Disciplinary Referral' })).toBeVisible();
  // Teachers get the form, never the inbox.
  await expect(page.getByRole('button', { name: 'Inbox' })).toHaveCount(0);

  const students: any[] = await (await request.get('/api/students', auth(admin.token))).json();
  const secondary = students.find((s) => Number(s.grade) >= 6);
  const stamp = `E2E referral ${Date.now()}`;
  await page.getByLabel('Name of Student(s) Involved').fill(secondary.student_id);
  await page.getByRole('option').first().click();
  await page.getByLabel('What are the strengths/positive attributes of the student?').fill('Kind to classmates, strong reader.');
  await page.getByLabel('Describe the situation that led to the referral.').fill(`${stamp}: refused to stop shouting during group work. Two classmates were upset.`);
  await page.getByLabel('What strategies did you use to address the situation with the student?').fill('Quiet reminder, then a short break outside.');
  await page.getByLabel('What suggestions or strategies do you think would work with this student so that the behavior does not repeat itself again in the future?').fill('Restorative conversation with the two classmates.');
  await page.getByRole('button', { name: 'Send to coordinators' }).click();
  await expect(page.getByTestId('referral-receipt')).toContainText(/Referral #\d+ sent/);

  // API: teacher and admin are refused; the coordinator sees it.
  expect((await request.get('/api/referrals', auth(teacher.token))).status()).toBe(403);
  expect((await request.get('/api/referrals', auth(admin.token))).status()).toBe(403);
  const list: any[] = await (await request.get('/api/referrals', auth(coord.token))).json();
  const mine = list.find((r) => r.situation.startsWith(stamp));
  expect(mine).toBeTruthy();
  expect(mine.status).toBe('New');
  expect(mine.submitted_by_name).toMatch(/Carlos/);
  // No mail server in tests: the record says so instead of pretending.
  expect(['not_configured', 'sent']).toContain(mine.email_status);
  const after = await (await request.get('/api/notifications/count', auth(coord.token))).json();
  expect(after.referrals).toBe(before.referrals + 1);

  // Coordinator UI: inbox → detail → mark in review.
  await openAs(page, coord, `/referrals?id=${mine.id}`);
  const detail = page.getByTestId('referral-detail');
  await expect(detail).toContainText(stamp);
  await detail.getByRole('button', { name: 'In review' }).click();
  await detail.getByLabel('Coordinator notes').fill('Met with the student on Friday.');
  await detail.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await (await request.get(`/api/referrals/${mine.id}`, auth(coord.token))).json()).status).toBe('In review');
});

// ---------------------------------------------------------------------------
// Bilingual parent email
// ---------------------------------------------------------------------------
test('the parent email is in Spanish first, then English', () => {
  const email = buildParentEmail({
    first_name: 'Ana',
    last_name: 'Pérez',
    date: '2026-10-05',
    time: '09:30',
    violation_type: 'Tardy to Class',
    category: 'Attendance',
    location: 'HALL — Hallway',
    description: 'Arrived late after lunch.',
    action_taken: null,
    penalty: 'Detention',
    penalty_served: null,
    parent_name: 'María Pérez',
    parent_email: 'maria@example.com',
  });
  expect(email.to).toBe('maria@example.com');
  expect(email.subject).toContain('Notificación de incidente');
  const es = email.body.indexOf('Estimado/a María Pérez:');
  const en = email.body.indexOf('Dear María Pérez,');
  expect(es).toBe(0);
  expect(en).toBeGreaterThan(es);
  expect(email.body).toContain('ENGLISH VERSION');
  expect(email.body).toContain('Lugar: HALL — Pasillo');
  expect(email.body).toContain('Consecuencia: Detención');
  expect(email.body).toContain('Location: HALL — Hallway');
  expect(email.body).toContain('Consequence: Detention');
});

// ---------------------------------------------------------------------------
// Saves are shared and show up for others without reloading
// ---------------------------------------------------------------------------
test('changes saved by one user appear for another user without a reload', async ({ page, request }) => {
  const admin = await token(request, ADMIN);
  const teacher = await token(request, TEACHER);
  const students: any[] = await (await request.get('/api/students', auth(admin.token))).json();
  const student = students.find((s) => s.student_id === 'S-2026-002');

  await openAs(page, admin, `/students/${student.id}`);
  const note = `Saved at ${Date.now()}`;
  // The teacher records a recognition from another device…
  const rec = await request.post('/api/recognitions', {
    ...auth(teacher.token),
    data: { student_id: student.id, category: 'Kindness', points: 1, note },
  });
  expect(rec.ok()).toBeTruthy();
  // …and the admin's open profile picks it up when the app regains focus.
  await page.waitForTimeout(2_100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(note).first()).toBeVisible({ timeout: 10_000 });

  // A field edit persists in the database.
  const observations = `Observation ${Date.now()}`;
  const put = await request.put(`/api/students/${student.id}`, { ...auth(admin.token), data: { ...student, observations } });
  expect(put.ok()).toBeTruthy();
  const again = await (await request.get(`/api/students/${student.id}`, auth(teacher.token))).json();
  expect(again.observations).toBe(observations);
});

// ---------------------------------------------------------------------------
// Fingerprint sign-in (virtual authenticator stands in for the sensor)
// ---------------------------------------------------------------------------
test('fingerprint sign-in: set up after a password login, then sign in with it', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto('/#/login');
  await page.getByPlaceholder('Enter username').fill(ADMIN.username);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  const offer = page.getByTestId('passkey-offer-dialog');
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Use fingerprint' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome Back!' })).toBeVisible({ timeout: 20_000 });

  // Sign out, then back in with the fingerprint only.
  await page.evaluate(() => { localStorage.removeItem('token'); localStorage.removeItem('user'); });
  await page.goto('/#/login');
  await page.reload();
  const quick = page.getByTestId('quick-signin');
  await expect(quick).toContainText('@admin');
  await quick.getByRole('button', { name: 'Sign in with fingerprint' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome Back!' })).toBeVisible({ timeout: 20_000 });

  // No password is stored on the device.
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain(ADMIN.password);
  expect(stored).not.toContain('sccs_saved_auth');
});
