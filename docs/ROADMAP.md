# SCCS Discipline Tracker — Road to Production

**Assessed against commit:** `9099dd3` · Node v22.22.2 · 2026-07-31
**Verdict today: NO-GO for real student data.** Not because the app is bad — the feature surface is genuinely
substantial — but because there are four unauthenticated paths into the system and the Students page is
currently broken on load. Both are fixable in a focused pass.

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

**C1 — Students page shows zero students on load.** `client/src/pages/Students.tsx:309-312`
Operator precedence bug. `||` binds tighter than `?:`, so the ternary condition evaluates as
`(filterGrade === 'all' || endsWith('A') || endsWith('B'))`. With the default filter `'all'`, that's `true`,
so it takes the *grade-match* branch and compares `s.grade === parseInt('all')` → `NaN` → false for every
student. The roster renders empty until you pick a specific grade. This is live on `master`.

**C2 — Unauthenticated admin-takeover endpoint.** `server/routes/index.ts:85`
`POST /api/auth/fix-admin` takes a single hardcoded password from source, resets the `admin` account's
password to a known value, and returns a valid admin JWT. No auth, no rate limit. Anyone who reads this
public repo has full admin access to production.

**C3 — Password reset returns the reset token in the HTTP response.** `server/routes/index.ts:181-217`
`POST /api/auth/forgot-password` responds with `resetToken` in the JSON body. Anyone who knows a username
can take over that account in two unauthenticated requests. The "don't reveal if the user exists" comment
directly above it is undone by the token being returned.

**C4 — Hardcoded admin credentials, re-applied on every boot.** `server/db.ts:220-247`
`ensureAdminUser()` runs at startup and *overwrites* a named admin account's password with a literal from
source on every deploy. Changing that password in the UI is silently reverted by the next restart. The same
literal is the C2 backdoor password.

**C5 — Open self-registration to a role that reads everything.** `server/routes/index.ts:269`
`POST /api/auth/firebase-register` is unauthenticated and grants role `user`. `authenticate` doesn't
distinguish roles, so any `user` can read the full student roster, every incident, and every MTSS record.
No email-domain allowlist, no admin approval step. (Live only if Firebase env vars are set in Railway —
**verify this before anything else.**)

**C6 — Student discipline records committed to the repository.**
`data/discipline.db` and `data/railway-backup.db` are tracked and contain 9 students with real-looking
names, 7 incidents, and a user row. `WORKING-CONFIG.env` is tracked and contains a JWT secret and demo
passwords. Git history rewrite + credential rotation required, not just `git rm`.

### 🟠 High

**H1 — No role checks on student, incident, MTSS, or settings mutations.**
Only 11 of 57 endpoints check `role`. Any authenticated teacher can `DELETE /api/students/:id`,
`DELETE /api/incidents/:id`, or `PUT /api/settings`. For a discipline system this is both a data-loss risk
and a records-integrity problem.

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

### 🟡 Medium

- **M1** — No input validation anywhere. No zod/joi; `grade || 9` style coercion only. No length limits, no
  email/phone format checks, no XSS sanitisation on free-text fields (`observations`, `description`, `notes`)
  that get rendered back.
- **M2** — No rate limiting on `/api/auth/login`, `/forgot-password`, or `/reset-password`.
- **M3** — `app.use(cors())` allows every origin; no helmet, no CSP, no HSTS, no `X-Frame-Options`.
- **M4** — No database indexes beyond primary keys. Dashboard aggregations scan `incidents` fully; fine at
  333 students, degrades over a school year.
- **M5** — 11 npm vulnerabilities in prod deps (3 high), all via `firebase-admin` → `@google-cloud/storage`.
- **M6** — 1.67 MB main JS bundle (499 KB gzipped) from `xlsx` + `jspdf` + `html2canvas` + `recharts` loaded
  eagerly. Slow on the school-network phones this is meant for.
- **M7** — `/api/backup` and `/api/restore` are unauthenticated stubs that return a "data is safe" message and
  do nothing. There is no actual backup story.
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

### Phase 0 — Stop the bleeding *(do this first, before anything else)*
Nothing here needs design decisions. It's containment.

1. Confirm whether Firebase env vars are set in Railway. If yes, **C5 is live** — disable
   `/api/auth/firebase-register` immediately.
2. Delete `/api/auth/fix-admin`, `/api/debug/users`, `/api/migrate-users` (C2). They are dev shortcuts with
   production consequences.
3. Stop returning `resetToken` in the forgot-password response (C3).
4. Remove `ensureAdminUser()`'s hardcoded credential; seed the first admin from an env var instead, once (C4).
5. Rotate: the JWT secret, that admin password, and any Firebase key. Assume all three are compromised —
   they're in a repo's history.
6. `git rm --cached` the two `.db` files and `WORKING-CONFIG.env`, add to `.gitignore`, then purge from
   history with `git filter-repo` (C6).
7. Fix the Students page ternary (C1) — a two-line change that restores the roster.

**Exit criteria:** no unauthenticated endpoint except `/login`, `/forgot-password`, `/reset-password`,
`/api/health`; no credential in source; Students page lists students.

### Phase 1 — Make the foundation trustworthy
1. **Authorization layer.** A `requireRole('admin')` middleware, applied deliberately to all 57 endpoints.
   Decide the real permission model first: what should a *teacher* be able to do vs. a *counselor* vs. an
   *admin*? Right now there are effectively two roles and one of them can do everything. (H1)
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

### Phase 3 — Harden for a school network
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
- C5's live status depends on Railway env vars I haven't inspected.
- No accessibility, performance, or cross-browser testing was performed.
