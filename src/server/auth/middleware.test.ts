import { describe, it, expect, vi } from 'vitest'

// Stub the framework imports so loading `./middleware` does not execute the
// real createMiddleware/createServerFn (which trigger a transitive
// @tanstack/start-client-core <-> @tanstack/start-server-core circular load
// under vitest 4's no-deps-optimizer mode, surfacing as
// "createMiddleware is not defined"). The unit under test, resolveUserFromCookie,
// is a pure helper that does not depend on these.
vi.mock('@tanstack/react-start', () => ({
  createMiddleware: vi.fn(() => ({ server: vi.fn(() => ({})) })),
  createServerFn: vi.fn(() => ({
    middleware: vi.fn(() => ({ handler: vi.fn(() => ({})) })),
  })),
}))
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: vi.fn(() => null),
}))
// The test stubs getSessionWithUser via vi.mocked; register the mock so the
// dynamic import inside each test returns the mocked module.
vi.mock('./session', () => ({ getSessionWithUser: vi.fn() }))

// eslint-disable-next-line import/first -- vi.mock calls above are hoisted by vitest above this import at runtime.
import { resolveUserFromCookie } from './middleware'

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
