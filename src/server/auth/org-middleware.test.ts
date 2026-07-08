import { describe, it, expect, vi, beforeEach } from 'vitest'

// Goal: when orgMiddleware's .server() body runs after auth, it calls
// ensureOrgForUser(user.id, user.email) when a user is present and injects
// the result as context.currentOrg; when there is no user it injects null and
// does NOT call ensureOrgForUser.
//
// TanStack Start's createMiddleware/createServerFn need an AsyncLocalStorage
// runtime context vitest doesn't provide. So we stub createMiddleware to
// capture the .server() callback, then invoke that callback directly with a
// synthetic { context, next }. This exercises the real composition logic
// (reading context.user, calling ensureOrgForUser, forwarding via next).

const ensureOrgForUser = vi.fn()

// Captured at module-load time when ./org-middleware calls createMiddleware()
// ...middleware([authMiddleware]).server(fn). We capture the LAST .server(fn)
// registered — that is orgMiddleware's handler (authMiddleware's handler, from
// ./middleware, runs first in the real chain but we don't need to exercise it
// here because the org handler reads `context.user` which we supply directly).
let capturedServer: ((args: {
  context: { user: { id: string; email: string } | null }
  next: (args: { context: Record<string, unknown> }) => Promise<unknown>
}) => Promise<unknown>) | null = null

// A chainable mock supporting both shapes used in the codebase:
//   createMiddleware({type:'function'}).server(fn)              // authMiddleware
//   createMiddleware({type:'function'}).middleware([...]).server(fn) // orgMiddleware
const chainable = () => ({
  middleware() { return chainable() },
  server(fn: typeof capturedServer) {
    capturedServer = fn
    return chainable()
  },
})

vi.mock('@tanstack/react-start', () => ({
  createMiddleware: () => chainable(),
  createServerFn: () => ({
    middleware: () => ({ handler: (h: unknown) => h }),
    handler: (h: unknown) => h,
  }),
}))

vi.mock('#/server/org', () => ({
  ensureOrgForUser: (...args: unknown[]) => ensureOrgForUser(...args),
}))

// Import AFTER mocks are hoisted. This populates `capturedServer`.
await import('./org-middleware')

function runServer(args: {
  context: { user: { id: string; email: string } | null }
  next: (args: { context: Record<string, unknown> }) => Promise<unknown>
}) {
  if (!capturedServer) throw new Error('middleware .server() was never captured')
  return capturedServer(args)
}

describe('orgMiddleware', () => {
  beforeEach(() => {
    ensureOrgForUser.mockReset()
  })

  it('calls ensureOrgForUser and injects currentOrg when a user is present', async () => {
    const org = { id: 'o1', name: "Jeanpaul's Org", slug: 'jeanpaul-1d2e3', role: 'OWNER' as const }
    ensureOrgForUser.mockResolvedValue(org)

    let captured: { currentOrg: unknown } | null = null
    const result = await runServer({
      context: { user: { id: 'u1', email: 'a@x.test' } },
      next: async (args) => {
        captured = args.context as { currentOrg: unknown }
        return 'next-result'
      },
    })

    expect(ensureOrgForUser).toHaveBeenCalledWith('u1', 'a@x.test')
    expect(captured).toEqual({ currentOrg: org })
    expect(result).toBe('next-result')
  })

  it('injects currentOrg=null and skips ensureOrgForUser when there is no user', async () => {
    let captured: { currentOrg: unknown } | null = null
    await runServer({
      context: { user: null },
      next: async (args) => {
        captured = args.context as { currentOrg: unknown }
        return 'next-result'
      },
    })

    expect(ensureOrgForUser).not.toHaveBeenCalled()
    expect(captured).toEqual({ currentOrg: null })
  })
})
