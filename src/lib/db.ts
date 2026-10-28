import path from 'path'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// The schema's literal "file:../db/sccs.db" resolves against wherever the
// generated client's schema.prisma lives, which is wrong inside the standalone
// production build. Open <project root>/db/sccs.db instead — the same file the
// Prisma CLI (db:push) writes to. The standalone server chdirs into
// .next/standalone, so `start` passes the absolute path in SCCS_DB_FILE; dev
// and the seed run from the project root and use the working directory.
const dbFile = process.env.SCCS_DB_FILE || path.join(process.cwd(), 'db', 'sccs.db')

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: `file:${dbFile}`,
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
