import { describe, it, expect, vi } from 'vitest'

// resolveUserFromCookie now lives in session-resolver.server.ts; stub its
// session dependency.
vi.mock('./session', () => ({ getSessionWithUser: vi.fn() }))

// eslint-disable-next-line import/first -- vi.mock is hoisted by vitest above this import.
import { resolveUserFromCookie } from './session-resolver.server'

describe('resolveUserFromCookie', () => {
  it('returns null when there is no cookie', async () => {
    expect(await resolveUserFromCookie(null)).toBeNull()
  })

  it('returns the user when the session is valid', async () => {
    const { getSessionWithUser } = await import('./session')
    const stub = vi.mocked(getSessionWithUser).mockResolvedValue({
      id: 's1', expiresAt: new Date(Date.now() + 1000), user: { id: 'u1', email: 'a@x.test' },
    })
    expect(await resolveUserFromCookie('session=s1')).toEqual({ id: 'u1', email: 'a@x.test' })
    stub.mockRestore()
  })

  it('returns null when the session is unknown', async () => {
    const { getSessionWithUser } = await import('./session')
    const stub = vi.mocked(getSessionWithUser).mockResolvedValue(null)
    expect(await resolveUserFromCookie('session=nope')).toBeNull()
    stub.mockRestore()
  })
})
