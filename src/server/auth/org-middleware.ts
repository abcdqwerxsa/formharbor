import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { authMiddleware } from './middleware'
import type { OrgMembership } from '#/server/org'

// `#/server/org` is server-only: it lazily imports `#/db`, which pulls in node
// `pg` and the Prisma `query_compiler_fast_bg.wasm?module` import. Import
// ensureOrgForUser lazily inside `.server()` — that body is stripped from the
// client split, so the db/Prisma chain never reaches the client bundle (same
// discipline as ./middleware importing ./session-resolver.server). A top-level
// value import here would leak `pg`/Prisma into the client and break
// `vite build` with UNLOADABLE_DEPENDENCY on the wasm `?module`.

/**
 * Composes authMiddleware. When a user is signed in, ensures they have a
 * default org (creating one on first visit) and injects it as
 * `context.currentOrg`. When there is no user, `currentOrg` is null.
 */
export const orgMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    const { ensureOrgForUser } = await import('#/server/org')
    const currentOrg: OrgMembership | null = context.user
      ? await ensureOrgForUser(context.user.id, context.user.email)
      : null
    return next({ context: { currentOrg } })
  })

/**
 * Server fn: return the current user's org (or null if signed out).
 */
export const getCurrentOrg = createServerFn({ method: 'GET' })
  .middleware([orgMiddleware])
  .handler(async ({ context }) => context.currentOrg)
