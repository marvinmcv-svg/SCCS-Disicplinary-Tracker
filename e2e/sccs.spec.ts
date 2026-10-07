import { test, expect, Page } from '@playwright/test';

/**
 * SCCS Discipline Tracker — E2E golden-path suite.
 * Runs against the Next.js port of the cloned repo (SPA at `/`, API routes
 * under /api). Data is the seeded demo set (600 students / ~900 incidents).
 */

const ADMIN = { username: 'admin', password: 'admin123' };
const TEACHER = { username: 'CarlosP', password: 'Carlos123456!' };

/** Log in through the UI and dismiss the optional fingerprint offer. */
async function login(page: Page, username = ADMIN.username, password = ADMIN.password) {
  await page.goto('/');
  await expect(page.getByPlaceholder('Enter username')).toBeVisible();
  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // "Use your fingerprint next time?" only appears on devices with a sensor.
  const dialog = page.getByTestId('passkey-offer-dialog');
  try {
    await dialog.waitFor({ state: 'visible', timeout: 3_000 });
    await dialog.getByText('Not now', { exact: true }).click();
  } catch {
    /* no fingerprint sensor in this browser */
  }

  await expect(page.getByRole('heading', { name: 'Welcome Back!' })).toBeVisible({ timeout: 20_000 });
}

/** Is this viewport mobile (< md / 768px)? */
async function isMobile(page: Page): Promise<boolean> {
  return (page.viewportSize()?.width ?? 0) < 768;
}

/**
 * Open a nav destination by label. Uses the bottom tab bar when present,
 * otherwise opens the hamburger drawer (mobile) or the sidebar (desktop).
 * The drawer's off-screen clone trick means we must always click a link
 * that is actually on-screen.
 */
async function navigateTo(page: Page, label: string) {
  const bottom = page.locator('nav.fixed.bottom-0').getByText(label, { exact: true });
  if (await bottom.isVisible().catch(() => false)) {
    await bottom.click();
    await page.waitForTimeout(400);
    return;
  }
  if (await isMobile(page)) {
    await page.locator('header button').first().click(); // hamburger
    await page.waitForTimeout(400);
  }
  await page.locator(`a:visible`, { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click();
  await page.waitForTimeout(400);
}

/** Value shown in the dashboard stat card titled `title`. */
async function statValue(page: Page, title: string): Promise<number> {
  const card = page.locator('button').filter({ has: page.locator('span', { hasText: new RegExp(`^${title}$`) }) }).first();
  const text = await card.locator('p').first().textContent();
  return Number(text?.replace(/[^0-9]/g, '') ?? NaN);
}

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------
test('login page renders branding, form and language toggle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Logo' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter username')).toBeVisible();
  await expect(page.getByTestId('login-password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('group', { name: /Language|Idioma/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Discipline Tracker' })).toBeVisible();
  // No stale-version banner: client and server version must agree
  await expect(page.getByText(/A new version/i)).toHaveCount(0);
});

test('wrong password shows an error and stays on login', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Enter username').fill('admin');
  await page.getByTestId('login-password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/Invalid/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder('Enter username')).toBeVisible();
});

test('stale/invalid token is rejected and user lands back on login', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('token', 'not-a-real-jwt');
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }));
  });
  await page.goto('/');
  // The SPA boots, API calls 401, interceptor clears storage and redirects to #/login
  await expect(page.getByPlaceholder('Enter username')).toBeVisible({ timeout: 20_000 });
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeNull();
});

test('Fix Admin Access modal opens with recovery form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Fix Admin Access/i }).click();
  await expect(page.getByTestId('fix-admin-password')).toBeVisible();
  await expect(page.getByRole('button', { name: /Reset Admin/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Dashboard (golden path after login)
// ---------------------------------------------------------------------------
test('admin login lands on dashboard with live stats', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Welcome Back!' })).toBeVisible();

  // Stat cards render with real seeded numbers (baseline 900/600; tests that
  // run earlier in this suite may add a few incidents, hence the range).
  const total = await statValue(page, 'Total');
  expect(total).toBeGreaterThanOrEqual(900);
  expect(total).toBeLessThanOrEqual(910);
  expect(await statValue(page, 'Students')).toBe(600);

  // Charts render (recharts svgs)
  await expect(page.locator('.recharts-responsive-container').first()).toBeVisible();

  // Recent incidents table
  await expect(page.getByText(/Recent Incidents/i)).toBeVisible();
});

test('dashboard date-range filter (Today) updates stats', async ({ page }) => {
  await login(page);
  const before = await statValue(page, 'Total');
  expect(before).toBeGreaterThanOrEqual(900);
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  await expect
    .poll(async () => statValue(page, 'Total'), { timeout: 15_000 })
    .toBeLessThan(before);
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
test('students roster loads with search', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'Students');

  const search = page.getByPlaceholder(/Search by name or ID/i);
  await expect(search).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const initialRows = await page.locator('tbody tr').count();
  expect(initialRows).toBeGreaterThan(0);

  // search narrows the roster
  await search.fill('Adams');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  const visible = await page.locator('tbody tr').count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(initialRows);
});

test('student profile shows conduct, incident timeline and MTSS', async ({ page }) => {
  await login(page);
  // pick a student that actually HAS an MTSS plan so the section renders
  const studentId = await page.evaluate(async () => {
    const token = localStorage.getItem('token')!;
    const [stRes, mtssRes] = await Promise.all([
      fetch('/api/students', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/mtss', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const students = await stRes.json();
    const mtss = await mtssRes.json();
    return (mtss[0]?.student_id ?? students[0].id) as number;
  });
  await page.goto(`/#/students/${studentId}`);
  await expect(page.getByRole('heading', { name: /Incident Timeline/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /MTSS Intervention/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Incidents — list, filter, create, resolve (the core workflow)
// ---------------------------------------------------------------------------
test('incidents list loads with rows and status badges', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'Incidents');
  await expect(page.getByPlaceholder(/Search incidents/i)).toBeVisible();
  await expect(page.locator('[data-testid=incident-row]:visible').first()).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('[data-testid=incident-row]:visible').count()).toBeGreaterThan(0);
  await expect(page.locator('.badge:visible').first()).toBeVisible();
});

test('record a new incident end-to-end and resolve it', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'Incidents');

  await page.getByRole('button', { name: /New Incident/i }).first().click();
  await expect(page.locator('.modal')).toBeVisible();

  // student combobox
  await page.getByPlaceholder('Search student...').fill('Roberts');
  await page.locator('.modal button:has-text("Roberts")').first().click();
  // violation combobox — pick a PlusPortals (SIS) discipline code. The
  // PlusPortals group leads the picker and carries a "SIS CODES" badge;
  // entries match by code (DISRUPT) or plain name (Classroom Disruption).
  await page.getByPlaceholder('Search violation...').fill('DISRUPT');
  await expect(page.locator('.modal').getByText('SIS CODES')).toBeVisible();
  await page.locator('.modal button:has-text("DISRUPT — Classroom Disruption")').first().click();

  // location + reported-by are selects (locations are PlusPortals SIS codes)
  const locationSelect = page.locator('.modal select').filter({ has: page.locator('option', { hasText: 'Hallway' }) });
  await locationSelect.selectOption('HALL — Hallway');
  const reportedBy = page.locator('.modal select').filter({ has: page.locator('option', { hasText: 'System Administrator' }) });
  await reportedBy.selectOption('System Administrator');

  await page.getByPlaceholder(/Describe what happened/i).fill('E2E playwright created this incident');

  // Submit. The button sits at the modal's scroll floor; Playwright's
  // mobile-emulation hit-target check is stricter than native hit-testing
  // here (manual elementFromPoint confirms the button receives the tap), so
  // scroll it into view and click with force to skip the pre-flight check.
  const submit = page.getByRole('button', { name: /Record Incident/i });
  await submit.scrollIntoViewIfNeeded();
  await submit.click({ force: true });

  // modal closes and the list reloads (async) — give the reload a beat
  await expect(page.locator('.modal')).toHaveCount(0, { timeout: 20_000 });

  // find the new incident (newest today, student surname Roberts) — it must
  // carry the PlusPortals code in its violation column
  await page.getByPlaceholder(/Search incidents/i).fill('Roberts');
  await expect(page.locator('[data-testid=incident-row]:visible').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid=incident-row]:visible').first()).toContainText('Open');
  await expect(page.locator('[data-testid=incident-row]:visible').first()).toContainText('DISRUPT — Classroom Disruption');

  // open its detail page (highest id → first row once the reload lands)
  await expect
    .poll(async () => page.evaluate(async () => {
      const token = localStorage.getItem('token')!;
      const res = await fetch('/api/incidents', { headers: { Authorization: `Bearer ${token}` } });
      const incidents = await res.json();
      const mine = incidents.find((i: { description: string }) => i.description === 'E2E playwright created this incident');
      return mine?.id ?? 0;
    }), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await page.locator('[data-testid=incident-row]:visible').first().click();
  await expect(page.getByText('E2E playwright created this incident').first()).toBeVisible({ timeout: 15_000 });

  // resolve it (status action button in detail header)
  await page.getByRole('button', { name: /^Resolved$/ }).first().click();
  // once resolved, the Resolved action disappears
  await expect(page.getByRole('button', { name: /^Resolved$/ })).toHaveCount(0, { timeout: 15_000 });
  // open the status log panel and verify the change was recorded
  await page.getByRole('button', { name: /Status Log/i }).click();
  await expect(page.getByText(/Status Change History/i)).toBeVisible();
  await expect(page.getByText(/Open → Resolved|Resolved/i).first()).toBeVisible();

  // cleanup: remove the test incident so the dataset stays deterministic
  await page.evaluate(async () => {
    const token = localStorage.getItem('token')!;
    const headers = { Authorization: `Bearer ${token}` };
    const res = await fetch('/api/incidents', { headers });
    const incidents = await res.json();
    const mine = incidents.find((i: { description: string }) => i.description === 'E2E playwright created this incident');
    if (mine) await fetch(`/api/incidents/${mine.id}`, { method: 'DELETE', headers });
  });
});

// ---------------------------------------------------------------------------
// MTSS / Violations / Users / Settings / Reports
// ---------------------------------------------------------------------------
test('MTSS page lists tiered interventions', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'MTSS');
  await expect(page.getByRole('heading', { name: /MTSS/i }).first()).toBeVisible();
  await expect(page.locator('tbody tr, [class*=card]').first()).toBeVisible({ timeout: 20_000 });
});

test('violations reference shows the full catalog incl. PlusPortals SIS codes', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'Violations');
  await expect(page.getByText('Tardy to School').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Weapons Possession').first()).toBeVisible();
  await expect(page.getByText('Fighting').first()).toBeVisible();
  // PlusPortals (Rediker SIS) discipline-code group — code + name entries
  await expect(page.getByText('DISRUPT — Classroom Disruption').first()).toBeVisible();
  await expect(page.getByText('TARDY — Tardy to School').first()).toBeVisible();
  await expect(page.getByText('WEAPON — Weapon Possession').first()).toBeVisible();
  // The four SIS code SETS (penalties / actions / served / locations)
  await expect(page.getByText('PlusPortals SIS Code Sets')).toBeVisible();
  await expect(page.getByText('PENALTIES · ACTIONS · SERVED · LOCATIONS')).toBeVisible();
  await expect(page.getByText('Out-of-School Suspension').first()).toBeVisible();
  await expect(page.getByText('Office Referral').first()).toBeVisible();
  await expect(page.getByText('Partially Served').first()).toBeVisible();
  await expect(page.getByText('Gymnasium').first()).toBeVisible();
});
test('users management lists seeded staff accounts (admin only)', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'Users');
  await expect(page.getByPlaceholder(/Search users/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('MsTello').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(':text-is("principal"):visible').first()).toBeVisible();
});

test('admin creates a user on the Users dashboard — persisted and can log in', async ({ page }) => {
  // Unique per run: the mobile and desktop projects must not collide on the
  // username (soft-deactivated rows still occupy it). The seed hard-prunes
  // every 'e2e-' user at the next run's globalSetup.
  const USER = { username: `e2e-persist-${Date.now()}`, password: 'Persist123!' };
  // Cleanup must run as ADMIN — the /api/users list is admin-only and the
  // created account is a teacher (its token would get a 403, not a list).
  const cleanup = async () => {
    await page.evaluate(async ({ admin, username }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(admin),
      });
      const { token: t } = await res.json();
      const headers = { Authorization: `Bearer ${t}` };
      const list = await (await fetch('/api/users', { headers })).json();
      const mine = Array.isArray(list) ? list.find((u: { username: string }) => u.username === username) : null;
      if (mine) await fetch(`/api/users/${mine.id}`, { method: 'DELETE', headers });
    }, { admin: ADMIN, username: USER.username });
  };

  await login(page);
  await navigateTo(page, 'Users');
  await expect(page.getByPlaceholder(/Search users/i)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /Add User/i }).first().click();
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible();

  await modal.locator('div:has(> label:text("Username")) input').fill(USER.username);
  await modal.locator('div:has(> label:text("Role")) select').selectOption('teacher');
  await modal.locator('div:has(> label:text("First Name")) input').fill('Endto');
  await modal.locator('div:has(> label:text("Last Name")) input').fill('Endee');
  await modal.locator('input[type="password"]').fill(USER.password);

  await modal.getByRole('button', { name: /^Create$/ }).click();
  await expect(page.getByText(/User created successfully/i)).toBeVisible({ timeout: 15_000 });

  // The account must survive a full reload (persisted server-side, not local
  // state) and the new credentials must authenticate.
  await page.reload();
  await expect(page.getByPlaceholder(/Search users/i)).toBeVisible({ timeout: 20_000 });
  const token = await page.evaluate(async (creds) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const data = await res.json();
    return data.token ?? '';
  }, USER);
  expect(token.length).toBeGreaterThan(0);

  // cleanup: deactivate the row as admin (seed hard-prunes 'e2e-' next run)
  await cleanup();
});

test('teacher (CarlosP) can register an incident with a PlusPortals code', async ({ page }) => {
  await login(page, TEACHER.username, TEACHER.password);
  await navigateTo(page, 'Incidents');

  await page.getByRole('button', { name: /New Incident/i }).first().click();
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible();

  // The staff list is admin-only — the page must still load its pickers for a
  // teacher (regression guard: Promise.all used to kill the whole load on the
  // /users 403, leaving the violation picker empty).
  await page.getByPlaceholder('Search violation...').fill('VAP');
  await expect(modal.getByText('SIS CODES')).toBeVisible();
  await modal.locator('button:has-text("VAP — Vaping/E-Cigarette")').first().click();

  await page.getByPlaceholder('Search student...').fill('Torres');
  await modal.locator('button:has-text("Torres, Amir")').first().click();

  await page.getByPlaceholder(/Describe what happened/i).fill('E2E teacher PlusPortals-code incident');

  // location + reported-by: the teacher sees only themselves in the staff list
  // (locations are PlusPortals SIS codes now)
  const locationSelect = modal.locator('select').filter({ has: page.locator('option', { hasText: 'Hallway' }) });
  await locationSelect.selectOption('HALL — Hallway');
  const reportedBy = modal.locator('select').filter({ has: page.locator('option', { hasText: 'Carlos P' }) });
  await reportedBy.selectOption('Carlos P');

  const submit = modal.getByRole('button', { name: /Record Incident/i });
  await submit.scrollIntoViewIfNeeded();
  await submit.click({ force: true });
  await expect(modal).toHaveCount(0, { timeout: 20_000 });

  // the new incident carries the PlusPortals code (the client search matches
  // id / student name / violation type, not the description — search surname)
  await page.getByPlaceholder(/Search incidents/i).fill('Torres');
  await expect(page.locator('[data-testid=incident-row]:visible').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid=incident-row]:visible').first()).toContainText('VAP — Vaping/E-Cigarette');
  await expect(page.locator('[data-testid=incident-row]:visible').first()).toContainText('PlusPortals');

  // cleanup as admin (teachers cannot delete incidents)
  await page.evaluate(async (admin) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(admin),
    });
    const { token: t } = await res.json();
    const headers = { Authorization: `Bearer ${t}` };
    const list = await (await fetch('/api/incidents', { headers })).json();
    const mine = list.find((i: { description: string }) => i.description === 'E2E teacher PlusPortals-code incident');
    if (mine) await fetch(`/api/incidents/${mine.id}`, { method: 'DELETE', headers });
  }, ADMIN);
});

test('register an incident with all five PlusPortals SIS code groups', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'Incidents');

  await page.getByRole('button', { name: /New Incident/i }).first().click();
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible();

  // infraction: PlusPortals (SIS) code group leads the picker
  await page.getByPlaceholder('Search violation...').fill('PROFAN');
  await modal.locator('button:has-text("PROFAN — Profanity/Inappropriate Language")').first().click();

  await page.getByPlaceholder('Search student...').fill('Roberts');
  await modal.locator('button:has-text("Roberts")').first().click();

  // location code (CLS — Classroom)
  const locationSelect = modal.locator('select').filter({ has: page.locator('option', { hasText: 'Classroom' }) });
  await locationSelect.selectOption('CLS — Classroom');
  // reported by
  const reportedBy = modal.locator('select').filter({ has: page.locator('option', { hasText: 'System Administrator' }) });
  await reportedBy.selectOption('System Administrator');
  // action code (OR — Office Referral)
  const actionSelect = modal.locator('select').filter({ has: page.locator('option', { hasText: 'Office Referral' }) });
  await actionSelect.selectOption('OR — Office Referral');

  await page.getByPlaceholder(/Describe what happened/i).fill('E2E five-code referral');

  // penalty code (DET — Detention): selecting it must auto-fill the
  // detention-hours quantity from the code's default (1) and pre-select the
  // served status PEND — Pending, like PlusPortals does.
  const penaltySelect = modal.locator('select').filter({ has: page.locator('option', { hasText: 'DET — Detention' }) });
  await penaltySelect.selectOption('DET — Detention');
  await expect(modal.getByText('PLUSPORTALS CODES')).toBeVisible();
  const detentionHours = modal.locator('div:has(> label:text("Detention Hours")) input');
  await expect(detentionHours).toHaveValue('1');
  const servedSelect = modal.locator('select').filter({ has: page.locator('option', { hasText: 'SRVD — Served' }) });
  await expect(servedSelect).toHaveValue('PEND — Pending');

  const submit = modal.getByRole('button', { name: /Record Incident/i });
  await submit.scrollIntoViewIfNeeded();
  await submit.click({ force: true });
  await expect(modal).toHaveCount(0, { timeout: 20_000 });

  // verify all five code groups persisted server-side
  const saved = await page.evaluate(async () => {
    const token = localStorage.getItem('token')!;
    const headers = { Authorization: `Bearer ${token}` };
    const list = await (await fetch('/api/incidents', { headers })).json();
    const mine = list.find((i: { description: string }) => i.description === 'E2E five-code referral');
    return mine ?? null;
  });
  expect(saved).not.toBeNull();
  expect(saved.violation_type).toBe('PROFAN — Profanity/Inappropriate Language');
  expect(saved.category).toBe('PlusPortals');
  expect(saved.location).toBe('CLS — Classroom');
  expect(saved.action_taken).toBe('OR — Office Referral');
  expect(saved.penalty).toBe('DET — Detention');
  expect(saved.penalty_served).toBe('PEND — Pending');
  expect(saved.detention_hours).toBe(1);

  // detail page shows the codes; mark the penalty Served and save
  await page.goto(`/#/incidents/${saved.id}`);
  await expect(page.getByText('E2E five-code referral').first()).toBeVisible({ timeout: 15_000 });
  const detailPenalty = page.locator('select').filter({ has: page.locator('option', { hasText: 'DET — Detention' }) });
  await expect(detailPenalty).toHaveValue('DET — Detention');
  const detailServed = page.locator('select').filter({ has: page.locator('option', { hasText: 'SRVD — Served' }) });
  await detailServed.selectOption('SRVD — Served');
  await page.getByRole('button', { name: /Save Changes/i }).first().click();
  await expect(page.getByText(/Changes saved successfully/i)).toBeVisible({ timeout: 15_000 });

  const afterSave = await page.evaluate(async (id) => {
    const token = localStorage.getItem('token')!;
    const res = await fetch(`/api/incidents/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    return await res.json();
  }, saved.id);
  expect(afterSave.penalty_served).toBe('SRVD — Served');
  expect(afterSave.penalty).toBe('DET — Detention');

  // cleanup
  await page.evaluate(async (id) => {
    const token = localStorage.getItem('token')!;
    await fetch(`/api/incidents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }, saved.id);
});

test('settings page loads school settings and alerts config', async ({ page }) => {
  await login(page);
  await navigateTo(page, 'Settings');
  await expect(page.getByText(/School Name/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Repeat Offender/i).first()).toBeVisible();
});

test('reports page renders summary', async ({ page }) => {
  await login(page);
  await page.goto('/#/reports');
  await expect(page.getByText(/Reports|Reportes/i).first()).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// i18n + logout + responsive chrome
// ---------------------------------------------------------------------------
test('language toggle switches the whole UI to Spanish', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('group', { name: /Language|Idioma/ }).getByRole('button', { name: 'ES' }).click();
  await expect(page.getByRole('button', { name: /^Iniciar sesión$/i })).toBeVisible();
  await page.getByPlaceholder(/Nombre de usuario/i).fill(ADMIN.username);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByRole('button', { name: /^Iniciar sesión$/i }).click();
  const dialog = page.getByTestId('passkey-offer-dialog');
  try {
    await dialog.waitFor({ state: 'visible', timeout: 3_000 });
    await dialog.getByText('Ahora no', { exact: true }).click();
  } catch { /* optional */ }
  await expect(page.getByRole('heading', { name: /Bienvenido/i })).toBeVisible({ timeout: 20_000 });
});

test('logout returns to the login screen', async ({ page }) => {
  await login(page);
  if (await isMobile(page)) {
    await page.locator('header button').first().click(); // hamburger opens drawer
    await page.waitForTimeout(400);
  }
  await page.locator('button:visible', { hasText: /^Logout$/ }).first().click();
  await expect(page.getByPlaceholder('Enter username')).toBeVisible({ timeout: 15_000 });
});

test('mobile: bottom navigation switches between core pages', async ({ page }) => {
  test.skip(!(page.viewportSize()?.width ?? 0) < 768, 'mobile-only navigation test');
  await login(page);
  const bottomNav = page.locator('nav.fixed.bottom-0');
  await expect(bottomNav).toBeVisible();
  await bottomNav.getByText('Students', { exact: true }).click();
  await expect(page.getByPlaceholder(/Search by name or ID/i)).toBeVisible({ timeout: 15_000 });
  await bottomNav.getByText('Incidents', { exact: true }).click();
  await expect(page.getByPlaceholder(/Search incidents/i)).toBeVisible({ timeout: 15_000 });
});

test('desktop: sidebar navigation reaches every section', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'desktop-only navigation test');
  await login(page);
  for (const label of ['Violations', 'Settings', 'MTSS']) {
    await page.locator('aside:visible').getByText(label, { exact: true }).first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('main')).toBeVisible();
  }
});
