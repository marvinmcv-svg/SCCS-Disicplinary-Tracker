# Backup and restore

This database holds student disciplinary records. Losing it means losing the
school's record of incidents, parent contacts, and MTSS interventions — data
that in most cases cannot be reconstructed.

On 2026-07-26 the hosted database became unreachable and stayed that way for
five days. It turned out to be a paused project and nothing was lost, but for
those five days there was no way to answer "is the data still there?" — because
there were no backups. That is the gap this document closes.

---

## What you have, and what you don't

| | Status |
|---|---|
| Automated provider backups | **Not on Supabase's free tier.** Daily backups start at the Pro plan. |
| Point-in-time recovery | Not available on free or Pro; a paid add-on. |
| Manual backups | `scripts/backup.sh` — run it, see below |
| Tested restore | ⬜ **Not yet done. Do this at least once.** |

An untested backup is not a backup. Until you have restored one into a scratch
database and logged in against it, treat recovery as unproven.

---

## Taking a backup

```bash
# DATABASE_URL comes from the Railway service variables
DATABASE_URL='postgresql://...' ./scripts/backup.sh
```

Writes a timestamped, compressed dump to `./backups/` and verifies the archive
is readable. Requires the PostgreSQL client tools:

- macOS: `brew install libpq && brew link --force libpq`
- Ubuntu/Debian: `sudo apt-get install postgresql-client`

**The dump contains real student records.** Store it encrypted, keep it out of
git (`backups/` is gitignored), and do not put it in a shared drive or CI
artifact that other people can download.

### How often

Weekly during term is a reasonable floor, plus one immediately before any
schema change or major deploy. Discipline data accumulates slowly, so the cost
of losing a week is real but survivable; the cost of losing everything is not.

---

## Restoring

### Into a fresh database (disaster recovery)

```bash
# 1. Create the target database (or provision a new Railway/Supabase instance)
# 2. Restore
pg_restore \
  --dbname='postgresql://...' \
  --no-owner \
  --no-acl \
  --clean --if-exists \
  ./backups/sccs-discipline-<timestamp>.dump
```

`--clean --if-exists` drops existing objects first, so this overwrites whatever
is in the target. Point it at the wrong database and you will destroy it —
check the connection string twice.

### A single table

```bash
pg_restore --dbname='postgresql://...' --table=incidents --data-only \
  ./backups/sccs-discipline-<timestamp>.dump
```

### Inspecting a dump without restoring

```bash
pg_restore --list ./backups/sccs-discipline-<timestamp>.dump
```

---

## Testing the restore (do this once, then twice a year)

1. Provision a scratch PostgreSQL — a Railway Postgres in a throwaway project
   is fine, or local Docker:
   `docker run -d -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:16-alpine`
2. Restore a recent dump into it using the command above.
3. Point a local server at it: `DATABASE_URL=... JWT_SECRET=test npm run server`
4. Log in, open the Students page, open a student's incident history.
5. Confirm the counts match production. Then delete the scratch database.

If step 4 fails, the backup is not usable and you need to know that now rather
than during an outage.

---

## The schema is created at boot, not by migrations

`server/db.ts` runs `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`
on every start. That makes a fresh database self-provisioning — restore data
into an empty instance and the app fills in any missing structure.

The tradeoff: there are **no down-migrations**. Nothing can automatically revert
a schema change. Take a backup before any deploy that alters the schema; that
dump is the only rollback path.

---

## Related risk: the database can pause itself

Supabase pauses free-tier projects after about a week of inactivity, which takes
the app down completely. A school app is idle every holiday, so this will recur.

Options, roughly in order of robustness:

1. Move to a Railway Postgres in the same project — no pausing, and
   `DATABASE_URL` becomes an internal reference rather than an external secret.
2. Supabase Pro — no pausing, and daily backups come with it.
3. Keep the free project awake with a scheduled ping. Cheapest, least reliable,
   and does nothing about backups.

`/api/health` now returns 503 when the database is unreachable, so whichever you
choose, point an uptime monitor at it.
