#!/usr/bin/env bash
# Vercel demo build: create and seed the SQLite file that ships with the API
# functions (see src/lib/db.ts), then build Next.js.
set -euo pipefail

bunx prisma db push

# SCCS_DB_DIRECT=1: write the real db/sccs.db (VERCEL=1 is set during builds
# too, which would otherwise redirect the seed to a throwaway /tmp copy).
SCCS_DB_DIRECT=1 INITIAL_ADMIN_USERNAME=admin INITIAL_ADMIN_PASSWORD=admin123 bun prisma/seed.ts

size=$(stat -c %s db/sccs.db)
if [ "$size" -lt 500000 ]; then
  echo "Seeded db/sccs.db is only ${size} bytes; refusing to ship an empty database." >&2
  exit 1
fi

next build
