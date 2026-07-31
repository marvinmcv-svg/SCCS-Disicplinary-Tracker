# SCCS Discipline Tracker — Road to Production

**Assessed against commit:** `9099dd3` · Node v22.22.2 · 2026-07-31
**Verdict: production is up and running the hardened build.** Phases 0, 1 and 3 are complete, and Phase 4's
backup and email work is done. Items marked ✅ are fixed; ⬜ need you, not code.

**Still blocking a real rollout:** no tested restore of a *production* dump (⬜ you), no foreign keys, no
input validation, and a database that pauses itself on the free tier.

---

## 1. What this app actually is

| | |
|---|---|
| Backend | Express + TypeScript, single 1,400-line route file, 57 endpoints |
| Database | PostgreSQL via raw `pg` (no ORM), schema created at boot in `server/db.ts` |
| Frontend | React 18 + Vite + Tailwind, 12 pages, React Router |
| Mobile | Capacitor Android wrapper |
| Hosting | Railway (nixpacks), server also serves `client/dist` in production |
| Auth | JWT (24h) + bcrypt, role stored in the token |

**Scope note:** the master pre-deployment prompt assumes Next.js/Supabase/Drizzle/Vercel/WhatsApp/Stripe.
None of that applies here. Phases below are the adapted equivalents. Explicitly **out of scope**: WhatsApp
Business Platform compliance, payment webhook idempotency, Drizzle schema drift, multi-tenant isolation,
bilingual/locale checks (app is English-only), SEO/sitemap (app is entirely behind login).

---

## 2. Findings that block launch

Everything below was verified by reading or running the code — not inferred.

### 🔴 Critical

**C-1 — ✅ RESOLVED. The production database was paused; the app was down.**
*(Found in the Railway deploy logs, 2026-07-31.)*
`DATABASE_URL` points at Supabase project `zkpirgpocklxpmboorhm`, and every query against it fails with
`ENOTFOUND — tenant/user postgres.zkpirgpocklxpmboorhm not found`. Every table creation, every migration and
the seed step all fail on boot; any API call that touches data returns a 500. Nobody can log in.

**This predates any change in this branch** — the identical error appears in the 2026-07-26 deployment.

Two things made it invisible:
1. `startServer()` catches the initialization error and calls `app.listen()` anyway, then logs
   *"Database initialization complete"* — the same line it logs on success. `server/index.ts:57-66`.
2. Railway reports the deployment as **SUCCESS**, because the process is running and holding the port.

So the dashboard is green, the logs say complete, and the app has been non-functional for days. This is the
single strongest argument for Phase 5's monitoring work.

**What the DNS evidence shows** (checked 2026-07-31):

| Check | Result |
|---|---|
| `aws-1-us-east-1.pooler.supabase.com` | Resolves normally — not a Railway or network fault |
| `db.zkpirgpocklxpmboorhm.supabase.co` | **NXDOMAIN** |
| `zkpirgpocklxpmboorhm.supabase.co` | **NXDOMAIN** |
| Pooler response | `Tenant or user not found` |

Both records being absent was read as the project having been **deleted**. **That inference was wrong.** The
project was paused, and Supabase drops the per-project DNS records while a project is paused — not only when
one is deleted. Restoring the project on 2026-07-31 brought back both records and the pooler tenant; the next
deploy created every table, applied every migration, and seeded cleanly. No data was lost.

The lasting lesson is not about DNS: **a paused free-tier Supabase project takes the app down silently**, and
nothing in the stack reported it. Free-tier projects pause after a week of inactivity. Either keep the project
active, move to a paid tier, or move to a database that does not pause — and add the uptime check in Phase 5
either way.

**Recovery inventory** — what exists if that data is gone:

- `students_import.csv` (repo root): 23 real grade-11 students with names, house teams, and counselors.
- `data/discipline.db` in git history: 9 students, 7 incidents, 1 user — from the earlier SQLite era.
- A standalone Railway Postgres in project `hearty-rebirth`, running with a volume since 2026-07-24.
  Its contents are unknown — its credentials are not readable through the API integration.
- No incident, MTSS, or parent-contact data is recoverable from anything in this repository.

**Note for C6:** `students_import.csv` also carries real student names and is still tracked. Add it to the
history purge.

**C0 — ✅ `JWT_SECRET` was not set in the Railway production service.**
*(Found by inspecting the deployed service's variable list — names only, never values. Set 2026-07-31;
the service redeployed successfully.)*
The code fell back to a secret literal committed to this repository, so every production token was signed
with a value anyone reading the repo could obtain — meaning anyone could forge a token for any account,
including an admin, without ever touching the login endpoint. This is worse than C2 because it leaves no
trace in the logs.
The server now refuses to start without `JWT_SECRET` rather than falling back, so this cannot silently
regress. Setting it invalidated every token issued to date, which was the point.

**C1 — ✅ Students page shows zero students on load.** `client/src/pages/Students.tsx:309-312`
Operator precedence bug. `||` binds tighter than `?:`, so the ternary condition evaluates as
`(filterGrade === 'all' || endsWith('A') || endsWith('B'))`. With the default filter `'all'`, that's `true`,
so it takes the *grade-match* branch and compares `s.grade === parseInt('all')` → `NaN` → false for every
student. The roster renders empty until you pick a specific grade. This is live on `master`.

**C2 — ✅ Unauthenticated admin-takeover endpoint.** `server/routes/index.ts:85`
`POST /api/auth/fix-admin` takes a single hardcoded password from source, resets the `admin` account's
password to a known value, and returns a valid admin JWT. No auth, no rate limit. Anyone who reads this
public repo has full admin access to production.

**C3 — ✅ Password reset returns the reset token in the HTTP response.** `server/routes/index.ts:181-217`
`POST /api/auth/forgot-password` responds with `resetToken` in the JSON body. Anyone who knows a username
can take over that account in two unauthenticated requests. The "don't reveal if the user exists" comment
directly above it is undone by the token being returned.

**C4 — ✅ Hardcoded admin credentials, re-applied on every boot.** `server/db.ts:220-247`
`ensureAdminUser()` runs at startup and *overwrites* a named admin account's password with a literal from
source on every deploy. Changing that password in the UI is silently reverted by the next restart. The same
literal is the C2 backdoor password.

**C5 — ✅ Open self-registration to a role that reads everything.** `server/routes/index.ts:269`
`POST /api/auth/firebase-register` is unauthenticated and grants role `user`. `authenticate` doesn't
distinguish roles, so any `user` can read the full student roster, every incident, and every MTSS record.
No email-domain allowlist, no admin approval step. **Verified: Firebase env vars are not set in Railway**,
so these endpoints would have thrown at runtime — the hole was latent, not live. Nothing in the client
imported Firebase either, so the whole integration was dead code and has been removed (which also cleared
all 11 dependency CVEs).

**C6 — ⬜ Student discipline records committed to the repository.**
`data/discipline.db` and `data/railway-backup.db` are tracked and contain 9 students with real-looking
names, 7 incidents, and a user row. `WORKING-CONFIG.env` is tracked and contains a JWT secret and demo
passwords. All three are now untracked and gitignored, **but they remain in git history** — a history
rewrite (`git filter-repo`) plus credential rotation is still required, and that is a destructive,
coordinate-with-everyone operation I have deliberately not performed.

### 🟠 High

**H1 — ✅ No role checks on student, incident, MTSS, or settings mutations.**
Only 11 of 57 endpoints checked `role`. Any authenticated teacher could `DELETE /api/students/:id`,
`DELETE /api/incidents/:id`, or `PUT /api/settings`. Fixed in Phase 1: every mutating endpoint now carries a
guard, backed by 16 tests. See `server/permissions.ts` for the matrix.

**H8 — ✅ Any user could forge another user's activity timestamps.** `PUT /api/users/:id/heartbeat`
took the user id from the URL and wrote `last_activity` / `last_login` for whoever it named, so any
authenticated account could mark a colleague as "currently online" or backfill their last-login time. Now
uses the caller's own id and ignores the parameter.

**H2 — No foreign keys, no cascade behaviour.** `server/db.ts:92-103`
`incidents.student_id`, `incidents.violation_id`, `mtss_interventions.student_id`, `incident_evidence.incident_id`
are plain `INTEGER NOT NULL` with no `REFERENCES`. Deleting a student silently orphans their entire incident
history; deleting a violation type orphans every incident citing it. Deletes are hard deletes with no audit row.

**H3 — Zero real test coverage.** `client/src/test/`
The two test files mock the module they're testing (`vi.mock('../lib/api')` then assert `api.post` was called).
9 tests pass and verify nothing. No server tests, no E2E, no CI test step — `.github/workflows/deploy.yml`
builds and deploys with no gate.

**H4 — `runQuery` never returns an insert ID.** `server/db.ts:56-67`
Returns `result.rows[0]?.id || 0`, but most INSERTs have no `RETURNING id`, so creates respond `{id: 0}`.
Latent — the UI refetches — but it will bite the moment anything relies on the returned ID.

**H5 — Client typecheck fails; the build doesn't run it.** 41 errors from `tsc --noEmit`, including the C1 bug
and `Reports.tsx:348` (`data.cursor` possibly null). `vite build` skips typechecking entirely, so none of this
blocks a deploy.

**H6 — Raw database errors returned to the client.** ~20 handlers do `res.status(400).json({ error: error.message })`,
leaking column names, constraint names, and SQL structure.

**H7 — `grade` has three conflicting types.** *(Found while fixing C1.)*
The DB column is `INTEGER`, `lib/api.ts` types it `number`, and `Students.tsx:12` declares a **local**
`interface Student` claiming `grade: string`. The student form holds it as a string, and the bulk-import
path builds values like `'7A'` — a grade and a section concatenated — before posting them at an integer
column. Pick one representation (`grade: number` + `section: string`), convert at the API boundary, and
delete the local interface. Until then the grade/section split is a guess at every call site.

### 🟡 Medium

- **M1** — No input validation anywhere. No zod/joi; `grade || 9` style coercion only. No length limits, no
  email/phone format checks, no XSS sanitisation on free-text fields (`observations`, `description`, `notes`)
  that get rendered back.
- **M2** — ✅ Rate limiting added, in two layers. A single per-IP limit was measured locking a valid user out
  when a *different* account was attacked — fatal for a school behind one NAT address — so the tight limit
  (10 / 15 min) is keyed to the account being targeted and the per-IP limit (150 / 15 min) only catches
  username spraying. Successful logins never count.
- **M3** — ✅ helmet with CSP, HSTS, `frame-ancestors 'none'`, `nosniff` and `Referrer-Policy`; CORS narrowed
  to `ALLOWED_ORIGINS` instead of reflecting any origin. `trust proxy` set so the limiter sees real client IPs.
- **M4** — ✅ 11 indexes created at boot, covering incident lookups by student/date/status/violation, roster
  filtering by grade and section, and the per-incident child tables.
- **M5** — ✅ *(mostly)* 11 prod-dependency CVEs (3 high) cleared by removing Firebase, plus `multer`,
  `axios`, `form-data`, `@babel/core` and `react-router` updated within their existing semver ranges.
  Server is now clean; one unfixable high remains client-side in `xlsx` (SheetJS has no patched npm
  release — needs either the vendor tarball or a different spreadsheet library, a Phase 3 decision).
- **M6** — 1.67 MB main JS bundle (499 KB gzipped) from `xlsx` + `jspdf` + `html2canvas` + `recharts` loaded
  eagerly. Slow on the school-network phones this is meant for.
- **M7** — ✅ Backups: `scripts/backup.sh` produces a verified compressed dump, and `docs/BACKUP.md` documents
  restore, a test-restore drill, and the retention tradeoffs. The full backup → restore → run-the-app cycle
  was exercised against a real PostgreSQL 16 instance. ⬜ **You still need to run it against production and
  keep the output somewhere safe** — an untested backup of the real database is not yet a backup.
- **M8** — JWT falls back to a hardcoded secret if `JWT_SECRET` is unset. Logout is client-side only; tokens
  stay valid for 24h after "logging out". No refresh/expiry UX.
- **M9** — 26 `console.log` calls in server code, several logging usernames and login outcomes.

### 🟢 Low

- **L1** — README documents a Rewards feature and a `rewards` table that don't exist in the Postgres schema.
- **L2** — README still advertises `admin`/`admin123` as the login.
- **L3** — `scripts/orphaned/`, `quick-start.bat`, `start.bat`, `start-servers.ps1`, `screenshot.png`,
  `students_import.csv` — dev leftovers in the repo root.
- **L4** — `railway.toml` and `.github/workflows/deploy.yml` disagree about how the client is built.

---

## 3. The roadmap

Six phases. Each gates the next — there is no point hardening auth on top of a schema that orphans records,
and no point running an E2E suite before the app has a working Students page.

### Phase 0 — Stop the bleeding — **code complete, 2 operator actions outstanding**

Done in code:

- ✅ Server refuses to boot without `JWT_SECRET` instead of falling back to a committed literal (C0).
- ✅ Removed `/api/auth/fix-admin`, `/api/debug/users`, `/api/migrate-users` (C2).
- ✅ Removed the no-op `/api/backup` and `/api/restore` stubs (M7). Unauthenticated endpoints: 10 → 3.
- ✅ `forgot-password` no longer returns the reset token (C3).
- ✅ First admin seeded once from `INITIAL_ADMIN_*` env vars, create-only, no hardcoded credential (C4).
- ✅ Removed the entire dead Firebase integration — both endpoints, the unused client module, and both
  packages (C5). Cleared 11 dependency CVEs as a side effect.
- ✅ Fixed the Students roster filter, extracted it to a testable function, and pinned it with 10 real
  regression tests (C1).

**⬜ Two things only you can do:**

1. **Set `JWT_SECRET` in the Railway service before the next deploy.** `openssl rand -hex 32`. The service
   will not start without it now. This also logs everyone out, which is intended — every token issued to
   date was signed with a publicly-known value.
2. **Set `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`** if the database has no admin yet. If your
   existing admin account still works after the deploy, skip this — the account is already there and these
   vars are ignored.

Then, when you're ready to deal with it (needs coordination, rewrites history):

3. **Purge `data/*.db` and `WORKING-CONFIG.env` from git history** with `git filter-repo`, and rotate the
   old admin password (C6). They're untracked now, but still recoverable from any clone.

**Exit criteria:** ✅ no unauthenticated endpoint except `/login`, `/forgot-password`, `/reset-password`,
`/api/health`; ✅ no credential in source; ✅ Students page lists students; ⬜ `JWT_SECRET` set in Railway.

### Phase 1 — Make the foundation trustworthy — **authorization done, schema work outstanding**
1. ✅ **Authorization layer.** `server/permissions.ts` defines the matrix and three guards; every mutating
   endpoint carries one. 16 tests pin the boundary, including that unknown/legacy roles fail closed. (H1, H8)

   | | admin | counselor | teacher | user |
   |---|:---:|:---:|:---:|:---:|
   | View students, incidents, reports | ✅ | ✅ | ✅ | ✅ |
   | Log & update incidents, evidence, escalate | ✅ | ✅ | ✅ | — |
   | Create/edit students, manage MTSS | ✅ | ✅ | — | — |
   | Delete anything, change settings, manage users | ✅ | — | — | — |

   ⚠️ **Fails closed.** Any staff account holding a role outside these four — or the legacy `user` role —
   becomes read-only. Audit the Users page after deploying.
2. **Schema integrity.** Add foreign keys with explicit `ON DELETE` behaviour — almost certainly `RESTRICT`
   for students (you should not be able to delete a student who has incidents) and soft-delete via an
   `archived_at` column instead. Add an audit table for who deleted/changed what. (H2)
3. **Input validation at every boundary.** zod schemas per endpoint. Sanitise anything rendered back as
   HTML. (M1)
4. **Indexes** on `incidents(student_id)`, `incidents(date)`, `incidents(status)`, `mtss_interventions(student_id)`,
   `students(grade, section)`. (M4)
5. Fix `runQuery` to use `RETURNING id` (H4); stop leaking DB errors (H6).

**Exit criteria:** a teacher account provably cannot delete a student or change settings — tested against the
API directly, not just a hidden button.

### Phase 2 — Prove it works (the QA prompt's real job)
This is where the QA sweep document earns its keep, but it can't run meaningfully until Phases 0–1 land.

1. **Set up a staging database.** This is the hard gate from the pre-deploy prompt's Phase 0, and right now
   you don't have one — there's a single Railway Postgres. Integration and E2E tests write real rows.
   **Do not run them against the database holding your school's records.**
2. Delete the fake tests, add real ones (H3):
   - Server integration tests against staging: every endpoint, happy path + unauthorized + malformed.
   - The authorization matrix: every role × every endpoint, asserting 403s.
   - Playwright E2E on the flows that actually matter: log an incident end-to-end, escalate it, record a
     parent contact, resolve it, open an MTSS intervention, run a report.
3. Wire `tsc --noEmit` and the test suite into `.github/workflows/deploy.yml` as a **gate** before deploy (H5).
4. Then run the full QA sweep document against staging with seeded fake students.

**Exit criteria:** CI blocks a deploy when tests fail; the QA sweep produces a bug list, not a crash list.

### Phase 3 — Harden for a school network — **complete**
1. helmet + CSP + HSTS; lock CORS to your actual domain (M3).
2. Rate limiting on all auth endpoints (M2).
3. Server-side session invalidation on logout; shorter token life + refresh (M8).
4. `npm audit` remediation — likely a `firebase-admin` major bump, or dropping it if Firebase auth isn't
   actually used (M5).
5. Strip `console.log` of usernames and auth outcomes; add structured logging (M9).

### Phase 4 — Make it usable for real staff
1. **A real backup story** (M7). Railway Postgres backups configured and *restore-tested* — an untested
   backup isn't a backup. This is the single most important operational item for a records system.
2. **Real password reset** — email delivery, so C3's fix doesn't leave staff unable to recover accounts.
3. Bundle splitting: lazy-load `xlsx`/`jspdf`/`html2canvas` behind the export buttons (M6). Should cut the
   initial load by more than half.
4. Accessibility pass — WCAG 2.1 AA, keyboard navigation through incident logging, 44×44px tap targets.
5. Responsive verification at 375/768/1440.

### Phase 5 — Operate it
1. Error tracking (Sentry) on client and server, with a test error actually fired.
2. Uptime monitoring on `/api/health`, alerting somewhere you'll see it.
3. A documented rollback path — schema changes are currently forward-only, applied at boot.
4. Data retention policy. Student discipline records carry legal retention and access obligations; decide
   who can see what, and for how long, before the first real record is entered.
5. Onboarding: import the real roster, create staff accounts, delete every demo account and the 333 demo
   students.

---

## 4. What I'd do first

Phase 0 is a single focused session and it's the difference between "a repo with a backdoor" and "a normal
app with bugs." Item 1 — checking whether Firebase is configured in Railway — takes a minute and determines
how urgent the rest is.

After that, Phase 1's authorization model is the one place that needs *your* input rather than mine: I can
implement any permission matrix, but what a teacher vs. counselor vs. principal should be allowed to do at
SCCS is a policy decision, not a technical one.

---

## 5. Known limitations of this assessment

- **Static + build analysis only.** I ran typecheck, build, the test suite, and `npm audit`. I did **not**
  exercise the running app in a browser, and I did **not** touch the production database — no staging
  environment exists to test against safely. Runtime bugs, broken buttons, and CSS issues are therefore
  **untested**; the QA sweep in Phase 2 is what finds those.
- **The live app was not reachable** from the environment this assessment ran in (the outbound proxy returns
  403 for the Railway domain), so no endpoint was verified against production. The Phase 0 fixes are verified
  by typecheck, build, and unit tests only — **watch the deploy logs on the next push**, since a missing
  `JWT_SECRET` now stops the server rather than silently falling back.
- Railway config was read via the API for **variable names only** — no values were retrieved or recorded.
- No accessibility, performance, or cross-browser testing was performed.
- The `INITIAL_ADMIN_*` seeding path has not been exercised against a real empty database.
