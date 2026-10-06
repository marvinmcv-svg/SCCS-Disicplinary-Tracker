#!/usr/bin/env bash
# Vercel build: create and seed the SQLite file that ships with the API
# functions (see src/lib/db.ts), then build Next.js. With SCCS_ROSTER_B64 set
# (encrypted project env var) the seed loads the school's real roster;
# without it, the demo dataset.
set -euo pipefail

bunx prisma db push

# SCCS_DB_DIRECT=1: write the real db/sccs.db (VERCEL=1 is set during builds
# too, which would otherwise redirect the seed to a throwaway /tmp copy).
# Set INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD as project env vars to
# replace the demo admin login.
SCCS_DB_DIRECT=1 INITIAL_ADMIN_USERNAME="${INITIAL_ADMIN_USERNAME:-admin}" INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-admin123}" bun prisma/seed.ts

students=$(bun -e "import { PrismaClient } from '@prisma/client'; const db = new PrismaClient(); console.log(await db.students.count()); await db.\$disconnect();")
if [ "${students:-0}" -lt 1 ]; then
  echo "Seeded db/sccs.db has no students; refusing to ship an empty database." >&2
  exit 1
fi
echo "Seeded ${students} students."

next build
