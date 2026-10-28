#!/bin/sh
# Production entrypoint (used by the Dockerfile): create or upgrade the SQLite
# schema, run the idempotent seed, then start the standalone server.
#
# Keep <project root>/db on a persistent volume. The seed regenerates the demo
# dataset on every start unless SCCS_SEED_DEMO_DATA=false (see .env.example).
set -e
cd "$(dirname "$0")/.."
mkdir -p db
npx prisma db push --skip-generate
bun prisma/seed.ts
export SCCS_DB_FILE="$PWD/db/sccs.db"
exec node .next/standalone/server.js
