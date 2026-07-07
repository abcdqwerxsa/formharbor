import { describe, it, expect } from 'vitest'
import { SESSION_COOKIE, readSessionId, buildSessionCookie, buildClearCookie } from './cookie'

describe('cookie utils', () => {
  it('reads a session id from a cookie header', () => {
    const header = `foo=bar; ${SESSION_COOKIE}=abc-123; other=x`
    expect(readSessionId(header)).toBe('abc-123')
  })

  it('returns null when no cookie / no session cookie', () => {
    expect(readSessionId(null)).toBeNull()
    expect(readSessionId('foo=bar')).toBeNull()
  })

  it('does not split on "=" inside the value', () => {
    expect(readSessionId(`${SESSION_COOKIE}=a=b=c`)).toBe('a=b=c')
  })

  it('builds a Set-Cookie with HttpOnly + SameSite=Lax + Path=/', () => {
    const c = buildSessionCookie('sid', 86400)
    expect(c).toContain(`${SESSION_COOKIE}=sid`)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Path=/')
    expect(c).toContain('Max-Age=86400')
  })

  it('builds a clearing cookie', () => {
    const c = buildClearCookie()
    expect(c).toContain('Max-Age=0')
  })
})
