import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * On Vercel the deployment filesystem is read-only, so the SQLite file seeded
 * at build time (db/sccs.db) is copied to /tmp on cold start and opened from
 * there. This is a demo mode: writes live only on that server instance and
 * reset when Vercel recycles it. Everywhere else the schema's literal URL is
 * used unchanged.
 */
function vercelDatabaseUrl(): string | undefined {
  // VERCEL=1 is also set during the build, where the seed script must write
  // the real db/sccs.db that gets bundled, so vercel.json runs the seed with
  // SCCS_DB_DIRECT=1 to skip the /tmp copy.
  if (!process.env.VERCEL || process.env.SCCS_DB_DIRECT === '1') return undefined
  const target = '/tmp/sccs.db'
  if (!fs.existsSync(target)) {
    fs.copyFileSync(path.join(process.cwd(), 'db', 'sccs.db'), target)
  }
  return `file:${target}`
}

const vercelUrl = vercelDatabaseUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    ...(vercelUrl ? { datasources: { db: { url: vercelUrl } } } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
