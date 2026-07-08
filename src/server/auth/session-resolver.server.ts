// Server-only by both the `.server.ts` filename suffix and the marker import.
// This keeps the session/db/Prisma import chain out of the client bundle.
import '@tanstack/react-start/server-only'
import { readSessionId } from './cookie'
import { getSessionWithUser } from './session'

export type CurrentUser = { id: string; email: string }

/** Given a raw Cookie header, return the user or null. */
export async function resolveUserFromCookie(cookieHeader: string | null): Promise<CurrentUser | null> {
  const sessionId = readSessionId(cookieHeader)
  if (!sessionId) return null
  const session = await getSessionWithUser(sessionId)
  return session ? session.user : null
}
