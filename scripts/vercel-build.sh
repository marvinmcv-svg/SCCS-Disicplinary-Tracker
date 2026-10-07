#!/usr/bin/env bash
# Vercel build: bring the Supabase Postgres schema up to date, top up reference
# data and the school roster, then build Next.js. Nothing here deletes data:
# `prisma db push` refuses changes that would lose data, and the seed only
# adds what is missing (see prisma/seed.ts).
set -euo pipefail

# Accept the variable names the Supabase <-> Vercel integration creates.
export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-}}"
export DIRECT_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set: add the Supabase connection strings to the Vercel project (see README)." >&2
  exit 1
fi

bunx prisma db push

# The school roster comes from the encrypted SCCS_ROSTER_B64 variable; without
# it, students are left exactly as they are (never the demo dataset).
if [ -z "${SCCS_ROSTER_B64:-}" ]; then export SCCS_ROSTER=none; fi

# Set INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD as project env vars to
# choose the first admin login. It is only created when no admin exists yet.
INITIAL_ADMIN_USERNAME="${INITIAL_ADMIN_USERNAME:-admin}" INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-admin123}" bun prisma/seed.ts

next build
