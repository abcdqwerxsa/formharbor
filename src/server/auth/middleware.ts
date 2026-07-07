import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { readSessionId } from './cookie'
import { getSessionWithUser } from './session'

export type CurrentUser = { id: string; email: string }

/** Pure-ish helper: given a raw Cookie header, return the user or null. */
export async function resolveUserFromCookie(cookieHeader: string | null): Promise<CurrentUser | null> {
  const sessionId = readSessionId(cookieHeader)
  if (!sessionId) return null
  const session = await getSessionWithUser(sessionId)
  return session ? session.user : null
}

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const user = await resolveUserFromCookie(getRequestHeader('cookie'))
    return next({ context: { user } })
  },
)

export const getCurrentUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => context.user)
