// Server-only: this module pulls in @prisma/adapter-pg (node 'pg' -> Buffer),
// which must never reach the client bundle.
import '@tanstack/react-start/server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '#/generated/prisma/client'

let _prisma: PrismaClient | undefined

/**
 * Resolve the Postgres connection string.
 * - On Cloudflare Workers (production + @cloudflare/vite-plugin dev): use the
 *   Hyperdrive binding (Workers can't open raw TCP to CockroachDB; Hyperdrive
 *   proxies it).
 * - Elsewhere (vitest): fall back to DATABASE_URL.
 */
async function getConnection(): Promise<string> {
  try {
    const { env } = await import('cloudflare:workers')
    if (env.HYPERDRIVE?.connectionString) return env.HYPERDRIVE.connectionString
  } catch {
    // not in a Workers runtime (e.g. vitest) — fall through
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set and no Hyperdrive binding is available')
  return url
}

export async function getPrisma(): Promise<PrismaClient> {
  if (!_prisma) {
    _prisma = new PrismaClient({ adapter: new PrismaPg(await getConnection()) })
  }
  return _prisma
}
