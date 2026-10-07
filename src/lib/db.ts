import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * One Prisma client per server instance, connected to Supabase Postgres
 * through DATABASE_URL (see prisma/schema.prisma). Every write goes straight
 * to the shared database, so all users and devices see the same data.
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    // The Supabase <-> Vercel integration names it POSTGRES_PRISMA_URL.
    datasourceUrl: process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL,
  })

globalForPrisma.prisma = db
