import { describe, it, expect, afterEach, vi } from 'vitest'
import { prisma } from '#/db'
import { register, login, logout } from './functions'
import { getRequestHeader } from '@tanstack/react-start/server'

// capture Set-Cookie writes
let setCookie: string[] = []

// Stub createServerFn so calling the resulting server fn with `{ data }`
// invokes the handler directly with `{ data }`. The real createServerFn
// requires a Start AsyncLocalStorage runtime context that vitest does not
// provide, so without this stub every test fails with
// "No Start context found in AsyncLocalStorage".
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (h: (args: { data: unknown }) => unknown) => (args: { data: unknown }) => h(args),
    }),
    middleware: () => ({
      handler: (h: (args: { data: unknown }) => unknown) => (args: { data: unknown }) => h(args),
    }),
    handler: (h: (args: { data?: unknown }) => unknown) => (args: { data?: unknown } = {}) => h(args),
  }),
}))

vi.mock('@tanstack/react-start/server', async () => {
  const actual = await vi.importActual('@tanstack/react-start/server')
  return {
    ...actual,
    setResponseHeader: (k: string, v: string) => { if (k === 'Set-Cookie') setCookie.push(v) },
    getRequestHeader: vi.fn(() => null), // no session by default
  }
})

afterEach(async () => {
  setCookie = []
  await prisma.session.deleteMany({})
  await prisma.user.deleteMany({})
})

describe('register', () => {
  it('creates a user, sets a session cookie, and returns the user', async () => {
    const user = await register({ data: { email: `r${Math.random()}@x.test`, password: 'password123' } })
    expect(user.email).toMatch(/@x\.test$/)
    expect(setCookie.some((c) => c.startsWith('session='))).toBe(true)
  })

  it('rejects a duplicate email', async () => {
    const email = `d${Math.random()}@x.test`
    await register({ data: { email, password: 'password123' } })
    await expect(register({ data: { email, password: 'password123' } })).rejects.toThrow()
  })
})

describe('login', () => {
  it('logs in a registered user and sets a cookie', async () => {
    const email = `l${Math.random()}@x.test`
    await register({ data: { email, password: 'password123' } })
    setCookie = []
    const user = await login({ data: { email, password: 'password123' } })
    expect(user.email).toBe(email)
    expect(setCookie.some((c) => c.startsWith('session='))).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const email = `w${Math.random()}@x.test`
    await register({ data: { email, password: 'password123' } })
    await expect(login({ data: { email, password: 'wrong-password' } })).rejects.toThrow()
  })
})

describe('logout', () => {
  it('clears the cookie when there is a session', async () => {
    const email = `o${Math.random()}@x.test`
    await register({ data: { email, password: 'password123' } })
    const sessionId = setCookie.find((c) => c.startsWith('session='))!.split('=')[1].split(';')[0]
    setCookie = []
    // simulate the request carrying the cookie
    vi.mocked(getRequestHeader).mockReturnValue(`session=${sessionId}`)
    await logout()
    expect(setCookie.some((c) => c.includes('Max-Age=0'))).toBe(true)
    vi.mocked(getRequestHeader).mockReturnValue(null)
  })

  it('is a no-op (still clears cookie) when there is no session', async () => {
    setCookie = []
    vi.mocked(getRequestHeader).mockReturnValue(null)
    await logout()
    expect(setCookie.some((c) => c.includes('Max-Age=0'))).toBe(true)
  })
})
