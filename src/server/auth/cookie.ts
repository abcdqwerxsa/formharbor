export const SESSION_COOKIE = 'session'
const ONE_DAY = 60 * 60 * 24
const SECURE = process.env.NODE_ENV === 'production'

function cookieFlags(maxAge: number): string {
  // __Host- prefix is avoided so dev (http://localhost) can store the cookie.
  return ['HttpOnly', SECURE ? 'Secure' : '', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`]
    .filter(Boolean)
    .join('; ')
}

export function buildSessionCookie(sessionId: string, maxAgeSeconds: number = ONE_DAY): string {
  return `${SESSION_COOKIE}=${sessionId}; ${cookieFlags(maxAgeSeconds)}`
}

export function buildClearCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieFlags(0)}`
}

export function readSessionId(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq) === SESSION_COOKIE) return part.slice(eq + 1)
  }
  return null
}
