// Server-only: this module pulls in @prisma/adapter-pg (node 'pg' -> Buffer),
// which must never reach the client bundle.
import '@tanstack/react-start/server-only'
import { neon } from '@neondatabase/serverless'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '#/generated/prisma/client'

// --- Raw Neon SQL client (used by src/routes/demo/neon.tsx) ---
let sqlClient: ReturnType<typeof neon> | undefined

export async function getClient() {
  if (!process.env.DATABASE_URL) return undefined
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL)
  return sqlClient
}

// --- Prisma client (Neon via @prisma/adapter-pg; used by src/routes/demo/prisma.tsx) ---
//
// This module is imported from route files that also end up in the CLIENT bundle,
// so the PrismaClient must NOT be constructed (or read env) at module scope —
// otherwise `new PrismaClient()` would run in the browser. The proxy lazily
// constructs on first property access, which happens inside a createServerFn
// handler (server-side).
//
// Production note (Cloudflare Workers): env is injected per-request on the edge,
// so prefer constructing the client per request inside the server function rather
// than caching this module-level singleton. See AGENTS.md.
let prismaClient: PrismaClient | undefined

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    if (!prismaClient) {
      const url = process.env.DATABASE_URL
      if (!url) {
        throw new Error('DATABASE_URL is not set; cannot create Prisma client.')
      }
      prismaClient = new PrismaClient({ adapter: new PrismaPg(url) })
    }
    return Reflect.get(prismaClient, property, receiver)
  },
})
