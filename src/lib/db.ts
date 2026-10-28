import path from 'path'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// The schema's literal "file:../db/sccs.db" resolves against wherever the
// generated client's schema.prisma lives. In the standalone production build
// that is .next/standalone/node_modules/.prisma/client, so the server could
// not find the database. Resolve <project root>/db/sccs.db from the working
// directory instead — the project root for dev, `start` and the seed, i.e.
// the same file the Prisma CLI (db:push) writes to.
const dbFile = path.join(process.cwd(), 'db', 'sccs.db')

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: `file:${dbFile}`,
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
