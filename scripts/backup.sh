#!/usr/bin/env bash
#
# Database backup for the SCCS Discipline Tracker.
#
# Produces a single compressed custom-format dump, which pg_restore can read
# selectively (one table, or the whole database). Plain SQL is easier to read but
# far less useful when you need to restore only the incidents table at 8am.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/backup.sh [output-directory]
#
# The dump contains real student records. Treat the output as confidential:
# store it encrypted, never commit it, and never put it in a public bucket or a
# CI artifact that others can download.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is not set." >&2
  echo "Find it in the Railway service variables, then re-run:" >&2
  echo "  DATABASE_URL=postgresql://... ./scripts/backup.sh" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "error: pg_dump not found. Install the PostgreSQL client tools:" >&2
  echo "  macOS:  brew install libpq && brew link --force libpq" >&2
  echo "  Ubuntu: sudo apt-get install postgresql-client" >&2
  exit 1
fi

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/sccs-discipline-$TIMESTAMP.dump"

echo "Backing up to $OUT_FILE ..."

# --no-owner / --no-acl keep the dump restorable into a database with different
# role names, which is what happens when restoring into a fresh Supabase or
# Railway instance.
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$OUT_FILE"

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "✓ Backup complete: $OUT_FILE ($SIZE)"

# A dump that restores nothing is the classic failure. Verify the archive is
# readable and actually contains the tables we expect before calling it a backup.
echo "Verifying archive ..."
TABLE_COUNT="$(pg_restore --list "$OUT_FILE" | grep -c 'TABLE DATA' || true)"

if [[ "$TABLE_COUNT" -lt 1 ]]; then
  echo "error: the archive contains no table data. Do not rely on this file." >&2
  exit 1
fi

echo "✓ Archive is readable and contains data for $TABLE_COUNT tables."
echo
echo "This verifies the file is intact — it does NOT prove a restore works."
echo "Run a real restore into a scratch database periodically; see docs/BACKUP.md."
