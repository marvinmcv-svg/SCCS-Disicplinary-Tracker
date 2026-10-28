import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * Account lockdown and family scoping: temporary passwords must be replaced
 * before anything else works, a password change ends older sessions, failed
 * sign-ins lock the account, and parent/student accounts only ever reach their
 * own linked students through /api/family. API-only, so it runs once.
 */

const ADMIN = { username: 'admin', password: 'admin123' };
const PARENT = { username: 'parent', password: 'Parent!2026' };
const PARENT2 = { username: 'parent2', password: 'Parent2!2026' };
const PENDING = { username: 'pendingparent', password: 'Pending!2026' };
const STUDENT = { username: 'student', password: 'Student!2026' };

const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

async function signIn(request: APIRequestContext, who: { username: string; password: string }) {
  const res = await request.post('/api/auth/login', { data: who });
  expect(res.ok(), `login ${who.username}`).toBeTruthy();
  return (await res.json()) as { token: string; user: { mustChangePassword: boolean } };
}

/** Tokens carry whole seconds: wait so a new token is issued after a change. */
const nextSecond = () => new Promise((r) => setTimeout(r, 1100));

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'API-only checks run once');
});

test('families reach only their own linked students', async ({ request }) => {
  const parent = await signIn(request, PARENT);
  for (const path of ['/students', '/students/1', '/incidents', '/dashboard/stats', '/mtss', '/users', '/reports/summary', '/violations']) {
    expect((await request.get(`/api${path}`, auth(parent.token))).status(), path).toBe(403);
  }

  const mine = await (await request.get('/api/family', auth(parent.token))).json();
  expect(mine.students.length).toBeGreaterThan(0);
  for (const s of mine.students) {
    expect(s).not.toHaveProperty('parent_email');
    for (const i of s.incidents) {
      expect(i).not.toHaveProperty('description');
      expect(i).not.toHaveProperty('notes');
    }
  }

  const other = await (await request.get('/api/family', auth((await signIn(request, PARENT2)).token))).json();
  const mineIds = new Set(mine.students.map((s: { id: number }) => s.id));
  expect(other.students.some((s: { id: number }) => mineIds.has(s.id))).toBe(false);

  // An unverified link gives no access; a student sees only themselves.
  expect((await (await request.get('/api/family', auth((await signIn(request, PENDING)).token))).json()).students).toHaveLength(0);
  expect((await (await request.get('/api/family', auth((await signIn(request, STUDENT)).token))).json()).students).toHaveLength(1);

  // Staff use the staff endpoints, not the family one.
  expect((await request.get('/api/family', auth((await signIn(request, ADMIN)).token))).status()).toBe(403);
});

test('admin-set passwords are temporary and a change ends older sessions', async ({ request }) => {
  const admin = await signIn(request, ADMIN);
  const user = { username: `e2e-temp-${Date.now()}`, password: 'Temp!pass99' };
  expect((await request.post('/api/users', { ...auth(admin.token), data: { ...user, role: 'teacher' } })).ok()).toBeTruthy();
  const published = await request.post('/api/users', {
    ...auth(admin.token),
    data: { username: `${user.username}-x`, password: 'Teacher!2026', role: 'teacher' },
  });
  expect(published.status()).toBe(400);

  const first = await signIn(request, user);
  expect(first.user.mustChangePassword).toBe(true);
  const blocked = await request.get('/api/students', auth(first.token));
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');

  const wrong = await request.post('/api/auth/change-password', {
    ...auth(first.token),
    data: { currentPassword: 'nope', newPassword: 'Mine!pass77' },
  });
  expect(wrong.status()).toBe(400);

  await nextSecond();
  const changed = await request.post('/api/auth/change-password', {
    ...auth(first.token),
    data: { currentPassword: user.password, newPassword: 'Mine!pass77' },
  });
  expect(changed.ok()).toBeTruthy();
  const fresh = (await changed.json()).token as string;
  expect((await request.get('/api/students', auth(first.token))).status()).toBe(401);
  expect((await request.get('/api/students', auth(fresh))).ok()).toBeTruthy();

  // Your own password never changes through the profile update.
  const users: { id: number; username: string }[] = await (await request.get('/api/users', auth(admin.token))).json();
  const id = users.find((u) => u.username === user.username)!.id;
  const viaProfile = await request.put(`/api/users/${id}`, {
    ...auth(fresh),
    data: { username: user.username, role: 'teacher', newPassword: 'Other!pass55' },
  });
  expect(viaProfile.status()).toBe(400);

  // An admin reset is temporary again and ends the user's sessions.
  await nextSecond();
  expect((await request.put(`/api/users/${id}/password`, { ...auth(admin.token), data: { password: 'Reset!pass44' } })).ok()).toBeTruthy();
  expect((await request.get('/api/students', auth(fresh))).status()).toBe(401);
  const afterReset = await signIn(request, { username: user.username, password: 'Reset!pass44' });
  expect(afterReset.user.mustChangePassword).toBe(true);

  // Deactivation applies to tokens already issued.
  await request.delete(`/api/users/${id}`, auth(admin.token));
  expect((await request.post('/api/auth/change-password', { ...auth(afterReset.token), data: {} })).status()).toBe(401);
});

test('ten failed sign-ins lock the account, even for the right password', async ({ request }) => {
  const admin = await signIn(request, ADMIN);
  const user = { username: `e2e-lock-${Date.now()}`, password: 'Lock!pass11' };
  await request.post('/api/users', { ...auth(admin.token), data: { ...user, role: 'teacher' } });
  for (let i = 0; i < 10; i++) {
    await request.post('/api/auth/login', { data: { username: user.username, password: 'wrong' } });
  }
  expect((await request.post('/api/auth/login', { data: user })).status()).toBe(429);
});
