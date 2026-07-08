import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'

// resolveUserFromCookie lives in ./session-resolver.server.ts (server-only) so
// the session/db/Prisma chain never reaches the client. Import it lazily inside
// .server() — that body is stripped from the client split.

export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { resolveUserFromCookie } = await import('./session-resolver.server')
  const user = await resolveUserFromCookie(getRequestHeader('cookie'))
  return next({ context: { user } })
})

export const getCurrentUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => context.user)
