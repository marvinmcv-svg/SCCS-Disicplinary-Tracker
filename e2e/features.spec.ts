import { test, expect, Page } from '@playwright/test';

/**
 * v2.1 feature suite: learning support (IEP / 504 / ELL plans and
 * accommodations), PBIS recognition, early-warning insights, the command
 * palette, the redesigned shell on every screen, and the /welcome landing
 * page with its product film. Runs on both the mobile and desktop projects.
 */

const ADMIN = { username: 'admin', password: 'admin123' };
const COUNSELOR = { username: 'counselor', password: 'Counselor!2026' };
const TEACHER = { username: 'CarlosP', password: 'Carlos123456!' };
const PARENT = { username: 'parent', password: 'Parent!2026' };

/** Fast API login: seeds the SPA session in localStorage. */
async function apiLogin(page: Page, who = ADMIN, lang: 'en' | 'es' = 'en') {
  await page.goto('/welcome');
  const res = await page.request.post('/api/auth/login', { data: who });
  expect(res.ok()).toBeTruthy();
  const { token, user } = await res.json();
  await page.goto('/');
  await page.evaluate(([t, u, l]) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', u);
    localStorage.setItem('sccs_language', l);
  }, [token, JSON.stringify(user), lang] as const);
  await page.reload();
  // Let the SPA finish its own login -> dashboard redirect before the test navigates.
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  return token as string;
}

async function api<T = any>(page: Page, token: string, path: string): Promise<T> {
  const res = await page.request.get(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok(), `${path} -> ${res.status()}`).toBeTruthy();
  return res.json();
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** The demo fixture student S-2026-002 always has an IEP + BIP. */
async function fixtureStudent(page: Page, token: string) {
  const students = await api<any[]>(page, token, '/students');
  const s = students.find((x) => x.student_id === 'S-2026-002');
  expect(s, 'fixture student S-2026-002 exists').toBeTruthy();
  return s as { id: number; first_name: string; last_name: string };
}

// ---------------------------------------------------------------------------
// Every screen: renders, no runtime errors, no horizontal overflow
// ---------------------------------------------------------------------------
const SCREENS: [string, RegExp][] = [
  ['/', /Welcome Back!/],
  ['/insights', /Insights/],
  ['/students', /Students/],
  ['/support', /Learning Support/],
  ['/recognition', /Recognition/],
  ['/mtss', /MTSS/],
  ['/incidents', /Incidents/],
  ['/violations', /Violations|Infraction/],
  ['/reports', /Reports/],
  ['/users', /User/],
  ['/settings', /Settings/],
];

test('every app screen renders without errors or sideways scrolling', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await apiLogin(page);
  for (const [route, text] of SCREENS) {
    await page.goto(`/#${route}`);
    await expect(page.locator('main').getByText(text).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);
    const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scrollW, `horizontal overflow on ${route}`).toBeLessThanOrEqual(innerW + 1);
    const viewport = page.viewportSize()!.width;
    expect(innerW, `layout viewport widened on ${route}`).toBeLessThanOrEqual(viewport + 1);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('student profile renders for the fixture student without overflow', async ({ page }) => {
  const token = await apiLogin(page);
  const s = await fixtureStudent(page, token);
  await page.goto(`/#/students/${s.id}`);
  await expect(page.getByRole('heading', { name: /Incident Timeline/i })).toBeVisible({ timeout: 20_000 });
  const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollW).toBeLessThanOrEqual(innerW + 1);
});

// ---------------------------------------------------------------------------
// Learning support
// ---------------------------------------------------------------------------
test('learning support: program tiles filter the plan list and open a plan', async ({ page }) => {
  await apiLogin(page, COUNSELOR);
  await page.goto('/#/support');
  const list = page.getByTestId('support-plan-list');
  await expect(list.locator('li').first()).toBeVisible({ timeout: 20_000 });

  // IEP tile filters to IEP plans only
  const tiles = page.getByTestId('plan-type-tiles');
  await tiles.getByRole('button', { name: /IEP/ }).click();
  await expect(page).toHaveURL(/type=IEP/);
  const rows = list.locator('li');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < Math.min(n, 8); i++) {
    await expect(rows.nth(i).locator('.plan-chip').first()).toHaveText('IEP');
  }

  // Search narrows the list
  await page.getByPlaceholder('Search students, needs or case managers').fill('Dyslexia');
  await expect(rows.first()).toContainText('Dyslexia');

  // Detail sheet lists accommodations and the behaviour guidance
  await rows.first().getByRole('button').click();
  const detail = page.getByTestId('support-plan-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Accommodations' })).toBeVisible();
  await expect(detail.getByRole('button', { name: /Edit plan/ })).toBeVisible();
});

test('learning support: counselor creates, edits and deletes a 504 plan', async ({ page }) => {
  const token = await apiLogin(page, COUNSELOR);
  const students = await api<any[]>(page, token, '/students');
  const target = students.find((s) => s.student_id === 'S-2026-150') ?? students[10];

  await page.goto('/#/support');
  await page.getByRole('button', { name: 'New Plan' }).click();
  const editor = page.getByTestId('support-plan-editor');
  await expect(editor).toBeVisible();
  await editor.locator('#plan-student').fill(target.student_id);
  await editor.getByRole('option').first().click();
  await editor.getByRole('button', { name: '504', exact: true }).click();
  await editor.locator('#plan-need').fill('E2E ADHD plan');
  await editor.locator('#plan-review').fill('2027-06-01');
  // one-tap suggested accommodation + one typed accommodation
  await editor.locator('.chip-suggest').first().click();
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await editor.getByLabel('Accommodation').last().fill('Seat near the door for movement breaks');
  await editor.getByRole('button', { name: 'Save plan' }).click();
  await expect(editor).toBeHidden({ timeout: 15_000 });

  // persisted with both accommodations
  const plans = await api<any[]>(page, token, `/support-plans?student_id=${target.id}`);
  const created = plans.find((p) => p.primary_need === 'E2E ADHD plan');
  expect(created).toBeTruthy();
  expect(created.plan_type).toBe('504');
  expect(created.accommodations.map((a: any) => a.description)).toContain('Seat near the door for movement breaks');
  expect(created.accommodations.length).toBe(2);

  // edit through the UI
  await page.getByPlaceholder('Search students, needs or case managers').fill('E2E ADHD plan');
  await page.getByTestId('support-plan-list').getByRole('button').first().click();
  await page.getByTestId('support-plan-detail').getByRole('button', { name: /Edit plan/ }).click();
  await page.getByTestId('support-plan-editor').locator('#plan-need').fill('E2E ADHD plan (edited)');
  await page.getByTestId('support-plan-editor').getByRole('button', { name: 'Save plan' }).click();
  await expect(page.getByTestId('support-plan-editor')).toBeHidden({ timeout: 15_000 });
  const after = await api<any>(page, token, `/support-plans/${created.id}`);
  expect(after.primary_need).toBe('E2E ADHD plan (edited)');

  // delete through the UI (confirm dialog)
  page.once('dialog', (d) => d.accept());
  await page.getByPlaceholder('Search students, needs or case managers').fill('E2E ADHD plan (edited)');
  await page.getByTestId('support-plan-list').getByRole('button').first().click();
  await page.getByTestId('support-plan-detail').getByRole('button', { name: /Delete plan/ }).click();
  await expect.poll(async () => (await api<any[]>(page, token, `/support-plans?student_id=${target.id}`)).some((p) => p.id === created.id)).toBe(false);
});

test('learning support: plan badges on the roster and the student profile', async ({ page }) => {
  const token = await apiLogin(page);
  const s = await fixtureStudent(page, token);
  await page.goto('/#/students');
  await page.getByPlaceholder(/Search by name or ID/i).fill('S-2026-002');
  const row = page.locator('tbody tr').first();
  await expect(row.locator('.plan-chip', { hasText: 'IEP' })).toBeVisible({ timeout: 20_000 });
  await expect(row.locator('.plan-chip', { hasText: 'BIP' })).toBeVisible();

  await page.goto(`/#/students/${s.id}`);
  const section = page.getByTestId('profile-support');
  await expect(section).toBeVisible({ timeout: 20_000 });
  await expect(section.getByRole('heading', { name: /Learning Support/ })).toBeVisible();
  await expect(section.locator('.plan-chip', { hasText: 'IEP' })).toBeVisible();
});

test('incident form shows the student plan and the IDEA removal warning', async ({ page }) => {
  const token = await apiLogin(page, COUNSELOR);
  const ew = await api<any>(page, token, '/insights/early-warning?limit=1');
  expect(ew.mdr_alerts.length).toBeGreaterThan(0);
  const mdr = ew.mdr_alerts[0];

  // Opened from the profile: the form is prefilled with the student
  await page.goto(`/#/students/${mdr.id}`);
  await page.getByRole('button', { name: 'Log incident' }).click();
  await expect(page.locator('.modal')).toBeVisible({ timeout: 15_000 });
  const alert = page.getByTestId('support-alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('This student has a learning support plan');
  await expect(page.getByTestId('mdr-warning')).toContainText(/Manifestation determination|10-day/);
});

test('teacher sees accommodations when picking a student in the incident form', async ({ page }) => {
  const token = await apiLogin(page, TEACHER);
  const s = await fixtureStudent(page, token);
  await page.goto('/#/incidents');
  await page.getByRole('button', { name: /New Incident/i }).first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.locator('.modal').getByPlaceholder('Search student...').fill(s.last_name);
  await page.locator('.modal').getByRole('button', { name: new RegExp(`${s.last_name}, ${s.first_name}`) }).first().click();
  await expect(page.getByTestId('support-alert')).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Recognition (PBIS)
// ---------------------------------------------------------------------------
test('recognition: award a student and see it in the feed', async ({ page }) => {
  const token = await apiLogin(page, TEACHER);
  const before = await api<any>(page, token, '/recognitions?days=7&limit=1');
  await page.goto('/#/recognition');
  await expect(page.getByTestId('recognition-feed')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Recognize a Student' }).click();
  const sheet = page.getByTestId('recognize-sheet');
  await sheet.locator('#rec-student').fill('S-2026-010');
  await sheet.getByRole('option').first().click();
  await sheet.getByRole('button', { name: 'Leadership', exact: true }).click();
  await sheet.getByRole('button', { name: 'More points' }).click();
  await expect(sheet.getByTestId('rec-points')).toHaveText('2');
  await sheet.locator('#rec-note').fill('E2E: led the group project');
  await sheet.getByRole('button', { name: 'Recognize', exact: true }).click();

  await expect(page.getByRole('status')).toContainText('was recognized', { timeout: 15_000 });
  await page.getByRole('button', { name: '7 days' }).click();
  await expect(page.getByTestId('recognition-feed')).toContainText('E2E: led the group project');
  const after = await api<any>(page, token, '/recognitions?days=7&limit=1');
  expect(after.total).toBe(before.total + 1);
});

test('recognition: the range control and leaderboard update', async ({ page }) => {
  await apiLogin(page);
  await page.goto('/#/recognition');
  await expect(page.getByTestId('recognition-leaders').locator('li').first()).toBeVisible({ timeout: 20_000 });
  const t30 = Number(await page.getByTestId('recognition-total').textContent());
  await page.getByRole('button', { name: '90 days' }).click();
  await expect.poll(async () => Number(await page.getByTestId('recognition-total').textContent())).toBeGreaterThanOrEqual(t30);
  await expect(page.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
});

// ---------------------------------------------------------------------------
// Insights (early warning)
// ---------------------------------------------------------------------------
test('insights: risk tiles, explainable factors and level filter', async ({ page }) => {
  await apiLogin(page, COUNSELOR);
  await page.goto('/#/insights');
  const list = page.getByTestId('risk-list');
  await expect(list.locator('li').first()).toBeVisible({ timeout: 20_000 });
  expect(Number(await page.getByTestId('insights-high').textContent())).toBeGreaterThan(0);
  await expect(list.locator('.factor-chip').first()).toBeVisible();
  await expect(list.locator('.score-pill').first()).toHaveClass(/score-high/);
  await expect(page.getByTestId('mdr-alerts')).toBeVisible();

  await page.getByRole('button', { name: 'Moderate', exact: true }).click();
  await expect(list.locator('.score-pill').first()).toHaveClass(/score-moderate/);

  // A row opens the student profile
  await list.getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: /Incident Timeline/i })).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Command palette + dashboard quick actions
// ---------------------------------------------------------------------------
test('command palette finds a student and jumps to screens', async ({ page }) => {
  const token = await apiLogin(page);
  const s = await fixtureStudent(page, token);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Welcome Back!' })).toBeVisible({ timeout: 20_000 });

  if (isMobile(page)) await page.locator('header').getByRole('button', { name: 'Search' }).click();
  else await page.keyboard.press('Control+k');
  const palette = page.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.locator('input').fill('S-2026-002');
  await expect(palette.getByText(`${s.last_name}, ${s.first_name}`)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#/students/${s.id}`));

  if (isMobile(page)) await page.locator('header').getByRole('button', { name: 'Search' }).click();
  else await page.keyboard.press('Control+k');
  await palette.locator('input').fill('Insights');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/insights/);

  if (isMobile(page)) await page.locator('header').getByRole('button', { name: 'Search' }).click();
  else await page.keyboard.press('Control+k');
  await palette.locator('input').fill('zzzz-no-match');
  await expect(palette).toContainText('No results');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('dashboard quick actions and at-a-glance cards navigate', async ({ page }) => {
  await apiLogin(page);
  await page.goto('/#/');
  const actions = page.getByRole('region', { name: 'Quick actions' });
  await expect(actions).toBeVisible({ timeout: 20_000 });

  await actions.getByRole('button', { name: 'New Incident' }).click();
  await expect(page.locator('.modal')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.modal')).toContainText('New Discipline Incident');

  await page.goto('/#/');
  await actions.getByRole('button', { name: 'Recognize' }).click();
  await expect(page.getByTestId('recognize-sheet')).toBeVisible({ timeout: 15_000 });

  await page.goto('/#/');
  await actions.getByRole('button', { name: 'Learning Support' }).click();
  await expect(page).toHaveURL(/#\/support/);

  await page.goto('/#/');
  await page.getByRole('region', { name: 'At a glance' }).getByRole('button').first().click();
  await expect(page).toHaveURL(/#\/insights/);
});

// ---------------------------------------------------------------------------
// Roles + language
// ---------------------------------------------------------------------------
test('parents never see confidential learning-support screens', async ({ page }) => {
  const token = await apiLogin(page, PARENT);
  await page.goto('/#/');
  await page.waitForTimeout(1500);
  if (isMobile(page)) {
    await expect(page.locator('nav.fixed.bottom-0').getByText('Support', { exact: true })).toHaveCount(0);
  } else {
    await expect(page.locator('aside:visible').getByText('Learning Support', { exact: true })).toHaveCount(0);
    await expect(page.locator('aside:visible').getByText('Insights', { exact: true })).toHaveCount(0);
  }
  for (const path of ['/support-plans', '/insights/early-warning', '/recognitions', '/support-plans/summary']) {
    const res = await page.request.get(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status(), path).toBe(403);
  }
});

test('new screens are fully translated to Spanish', async ({ page }) => {
  await apiLogin(page, ADMIN, 'es');
  await page.goto('/#/support');
  await expect(page.getByRole('heading', { name: 'Apoyo al aprendizaje', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/recognition');
  await expect(page.getByRole('heading', { name: 'Reconocimiento', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/insights');
  await expect(page.getByRole('heading', { name: 'Indicadores', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Riesgo alto')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Landing page + product film
// ---------------------------------------------------------------------------
test('landing page: hero, sections, sign-in and no sideways scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1, name: 'Every student, seen clearly.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One workspace for the whole student.' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Accommodations travel with the student.' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Ready when the bell rings.' })).toBeAttached();

  // every image on the page loads
  for (let y = 0; y < 8000; y += 600) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(80);
  }
  const broken = await page.evaluate(() =>
    Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
  );
  expect(broken).toEqual([]);
  const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollW).toBeLessThanOrEqual(innerW + 1);

  // no em dashes in visible copy (taste-skill rule)
  expect(await page.locator('.welcome').innerText()).not.toMatch(/[–—]/);

  // Sign in goes to the app
  await page.locator('header').getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByPlaceholder('Enter username')).toBeVisible({ timeout: 20_000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('landing page: the product film loads and plays', async ({ page }) => {
  await page.goto('/welcome#film');
  const video = page.getByTestId('demo-video');
  await video.scrollIntoViewIfNeeded();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
  expect(duration).toBeGreaterThan(40);
  expect(duration).toBeLessThan(50);
  await page.getByRole('button', { name: 'Play the product film' }).click();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.3);
  await expect(video).toHaveAttribute('controls', '');
});

test('login page links to the landing page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Discover what SCCS can do/ }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every student, seen clearly.');
});

// ---------------------------------------------------------------------------
// Installable app (PWA) and app icons
// ---------------------------------------------------------------------------
test('the app is installable: manifest, logo icons and a registered service worker', async ({ page }) => {
  const manifestRes = await page.request.get('/manifest.json');
  expect(manifestRes.ok()).toBeTruthy();
  const manifest = await manifestRes.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.theme_color).not.toBe('#26A69A');
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']));
  for (const icon of manifest.icons) {
    const res = await page.request.get(icon.src);
    expect(res.ok(), icon.src).toBeTruthy();
    expect(res.headers()['content-type']).toContain('image/png');
  }
  expect((await page.request.get('/apple-touch-icon.png')).ok()).toBeTruthy();
  const sw = await page.request.get('/sw.js');
  expect(sw.ok()).toBeTruthy();
  expect(sw.headers()['cache-control']).toContain('no-cache');

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/);
  const scope = await page.evaluate(async () => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
    ]);
    return reg ? reg.scope : null;
  });
  expect(scope).toBe(new URL('/', page.url()).href);
});

test('install app explains the steps when the browser has no install prompt', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: 'Install app' }).click();
  const help = page.getByTestId('install-help');
  await expect(help).toBeVisible();
  await expect(help).toContainText(/Add to Home Screen|Install SCCS/);
  await help.getByRole('button', { name: 'Done' }).click();
  await expect(help).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------
const bg = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);
const isDarkColor = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60;
};

test('dark mode follows the device and can be pinned in Settings', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await apiLogin(page);
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(isDarkColor(await bg(page, '.sccs-app'))).toBeTruthy();

  await page.goto('/#/settings');
  const appearance = page.getByRole('group', { name: 'Appearance' }).first();
  await appearance.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(isDarkColor(await bg(page, '.card'))).toBeFalsy();

  // The choice survives a reload, even though the device is still dark.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  await page.getByRole('group', { name: 'Appearance' }).first().getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(isDarkColor(await bg(page, '.card'))).toBeTruthy();
  await page.getByRole('group', { name: 'Appearance' }).first().getByRole('button', { name: 'Automatic' }).click();
});

test('every screen in dark mode: dark surfaces, readable text, no sideways scrolling', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await apiLogin(page);
  for (const [route, text] of SCREENS) {
    await page.goto(`/#${route}`);
    await expect(page.locator('main').getByText(text).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const report = await page.evaluate(() => {
      const lum = (c: string) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      // Any large light panel in dark mode is a missed surface.
      const lightPanels = [...document.querySelectorAll('main *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const a = Number((cs.backgroundColor.match(/[\d.]+/g) ?? [])[3] ?? 1);
          return r.width > 120 && r.height > 40 && a > 0.5 && lum(cs.backgroundColor) > 200;
        })
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`);
      const h1 = document.querySelector('main h1');
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        lightPanels: lightPanels.slice(0, 5),
        h1: h1 ? lum(getComputedStyle(h1).color) : 255,
      };
    });
    expect(report.overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(0);
    expect(report.lightPanels, `${route} light panels in dark mode`).toEqual([]);
    expect(report.h1, `${route} heading is light on dark`).toBeGreaterThan(200);
  }
});
