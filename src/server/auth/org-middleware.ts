import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { authMiddleware } from './middleware'
import type { OrgMembership } from '#/server/org'
import { ensureOrgForUser } from '#/server/org'

// `#/db` (via ensureOrgForUser) is server-only. ensureOrgForUser already
// imports getPrisma lazily inside its body, so it is safe to reference at the
// module top level here — the DB import chain only resolves when the function
// actually runs.

/**
 * Composes authMiddleware. When a user is signed in, ensures they have a
 * default org (creating one on first visit) and injects it as
 * `context.currentOrg`. When there is no user, `currentOrg` is null.
 */
export const orgMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
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

/**
 * Helper for routes/server fns that operate on a specific org (e.g. Form CRUD
 * in M1b). Loads the membership for the current user + the given orgId and:
 *  - throws a 404-shaped error if no such membership exists (user is not in
 *    this org, or the org does not exist),
 *  - otherwise returns the membership (id/name/slug/role).
 *
 * This is the minimal M1a version — it has no caller yet; M1b Form routes will
 * use it to gate per-org resources. It is intentionally NOT wired into
 * orgMiddleware (which only resolves the user's *default* org) so that routes
 * which don't take an orgId param aren't blocked on it.
 */
export async function requireOrgMember(orgId: string): Promise<OrgMembership> {
  const { getPrisma } = await import('#/db')
  const { getCurrentUser } = await import('./middleware')
  const user = await getCurrentUser()
  if (!user) {
    const err = new Error('Not found')
    // @ts-expect-error -- augment with an HTTP-ish status for the caller/router
    err.status = 404
    throw err
  }

  const prisma = await getPrisma()
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: user.id, orgId } },
    select: {
      role: true,
      org: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!membership) {
    const err = new Error('Not found')
    // @ts-expect-error -- augment with an HTTP-ish status for the caller/router
    err.status = 404
    throw err
  }
  return {
    id: membership.org.id,
    name: membership.org.name,
    slug: membership.org.slug,
    role: membership.role,
  }
}
