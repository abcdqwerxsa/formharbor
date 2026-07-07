# FormHarbor M0 — Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-hosted email/password authentication (register / login / logout) with PBKDF2 password hashing and an HttpOnly session cookie, so the app knows the current user on the server and can guard `/app`.

**Architecture:** Prisma `User` + `Session` tables in postgres. Passwords hashed with Web Crypto PBKDF2. An opaque session id is stored in an HttpOnly cookie; a server-function middleware reads the cookie → loads the session/user → injects `user` into context. An `_authenticated` route layout calls `getCurrentUser()` in `beforeLoad` and redirects to `/login` when there is no user. The WorkOS client-only provider is removed.

**Tech Stack:** TanStack Start (`createServerFn`, `createMiddleware`, server routes), Prisma + Neon (postgres), Web Crypto (`crypto.subtle`) PBKDF2, zod validators, vitest.

## Global Constraints

- Enter the Nix shell with `nix --extra-experimental-features 'nix-command flakes' develop`; package manager is **bun**.
- `.npmrc` pins npmmirror; **`@workos/node` is NOT installable here** — do not attempt it. This plan removes WorkOS instead.
- TanStack Start on Cloudflare Workers; `nodejs_compat` is already on. Use **Web Crypto (`crypto.subtle`)** — native on Node 20+ and Workers.
- **CockroachDB** via Prisma (`provider = "cockroachdb"` in `prisma/schema.prisma`). CockroachDB disallows `Int @default(autoincrement())` — use `String @default(cuid())` or `BigInt`.
- **Prisma must run with proxy env vars unset** (the box's SOCKS proxy can't carry Postgres wire; direct connect works). Prefix every DB-touching command/process (`prisma`, `db:*`, `bun run dev`, vitest) with: `unset ALL_PROXY all_proxy HTTP_PROXY http_proxy HTTPS_PROXY https_proxy NO_PROXY no_proxy`. `DATABASE_URL` already includes `connect_timeout=30`; the remote DB is slow (~70s for first push), so **retry on P1001**.
- Run `bun run db:generate` after editing `prisma/schema.prisma`; run `bun run db:push --accept-data-loss` to apply.
- Read `process.env` and request cookies **inside** handlers / middleware `.server()`, never at module scope.
- `createMiddleware` method order: `middleware()` → `validator()` → `client()` → `server()`.
- **Prerequisite:** CockroachDB `DATABASE_URL` is configured in `.env.local` (already set; direct connect works only with proxy env unset).
- Lint stays green: `bun run lint` must pass. Commit after each task.

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Add `User`, `Session` models. |
| `src/server/auth/password.ts` | `hashPassword` / `verifyPassword` (PBKDF2). Pure. |
| `src/server/auth/password.test.ts` | Unit tests for hashing. |
| `src/server/auth/cookie.ts` | `readSessionId`, `buildSessionCookie`, `buildClearCookie`. Pure. |
| `src/server/auth/cookie.test.ts` | Unit tests for cookie strings. |
| `src/server/auth/session.ts` | `createSession` / `getSessionWithUser` / `deleteSession` (Prisma). |
| `src/server/auth/session.test.ts` | Integration tests (needs DB). |
| `src/server/auth/middleware.ts` | `authMiddleware` (injects `user`) + `getCurrentUser` server fn. |
| `src/server/auth/middleware.test.ts` | Tests for the middleware logic. |
| `src/server/auth/functions.ts` | `register`, `login`, `logout` server functions. |
| `src/server/auth/functions.test.ts` | Integration tests for register/login/logout (needs DB). |
| `src/routes/register.tsx`, `src/routes/login.tsx` | Public auth pages. |
| `src/routes/_authenticated.tsx` | Layout that redirects to `/login` when not signed in. |
| `src/routes/_authenticated/app.tsx` | Protected home (shows current user + logout). |
| `src/routes/__root.tsx` | Remove `WorkOSProvider` wrapper. |
| `src/integrations/workos/` | Deleted (no longer used). |

---

### Task 1: Prisma `User` + `Session` models

**Files:**
- Modify: `prisma/schema.prisma` (append models)
- Modify: `src/generated/prisma/` (regenerated)

**Interfaces:**
- Produces: Prisma models `User { id, email, passwordHash, createdAt, sessions }` and `Session { id, userId, expiresAt, createdAt, user }`, available as `prisma.user` / `prisma.session` via the lazy client in `src/db.ts`.

- [ ] **Step 1: Append the models to the schema**

Append to `prisma/schema.prisma` (after the existing `Todo` model):

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  sessions     Session[]
}

model Session {
  id        String   @id // opaque randomUUID stored in the cookie
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Generate the client + push to the DB**

Run (inside the Nix shell):
```bash
bun run db:generate && bun run db:push
```
Expected: `✔ Generated Prisma Client` and `🚀 Your database is now in sync with your schema`.

- [ ] **Step 3: Verify the tables exist**

Run:
```bash
bunx --bun tsx -e "import {prisma} from '#/db'; const u=await prisma.user.count(); const s=await prisma.session.count(); console.log({u,s}); await prisma.\$disconnect()"
```
Expected: `{ u: 0, s: 0 }`.

- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma src/generated/prisma
git commit -m "feat(auth): add User and Session models"
```

---

### Task 2: Password hashing (PBKDF2 via Web Crypto)

**Files:**
- Create: `src/server/auth/password.ts`
- Test: `src/server/auth/password.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>` — returns `"pbkdf2$<iter>$<b64salt>$<b64hash>"`.
  - `verifyPassword(password: string, stored: string): Promise<boolean>` — constant-time compare.

- [ ] **Step 1: Write the failing test**

`src/server/auth/password.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('hashes then verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash.startsWith('pbkdf2$')).toBe(true)
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('hunter2')
    expect(await verifyPassword('hunter3', hash)).toBe(false)
  })

  it('produces different salts (different hashes for same password)', async () => {
    const a = await hashPassword('same')
    const b = await hashPassword('same')
    expect(a).not.toBe(b)
  })

  it('rejects a malformed stored value', async () => {
    expect(await verifyPassword('x', 'not-a-valid-hash')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/server/auth/password.test.ts
```
Expected: FAIL (`Cannot find module './password'`).

- [ ] **Step 3: Implement**

`src/server/auth/password.ts`:
```ts
const ITERATIONS = 100_000
const KEY_BITS = 256
const enc = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations <= 0) return false
  const salt = fromBase64(parts[2])
  const expected = fromBase64(parts[3])
  const computed = await derive(password, salt, iterations)
  return constantTimeEqual(computed, expected)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/server/auth/password.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add src/server/auth/password.ts src/server/auth/password.test.ts
git commit -m "feat(auth): PBKDF2 password hashing"
```

---

### Task 3: Session cookie utilities (pure)

**Files:**
- Create: `src/server/auth/cookie.ts`
- Test: `src/server/auth/cookie.test.ts`

**Interfaces:**
- Produces:
  - `SESSION_COOKIE = 'session'`
  - `readSessionId(cookieHeader: string | null | undefined): string | null`
  - `buildSessionCookie(sessionId: string, maxAgeSeconds: number): string` — a full `Set-Cookie` value.
  - `buildClearCookie(): string` — a `Set-Cookie` that expires the cookie.

> Dev note: we use `Secure` only in production. `__Host-` prefix would require HTTPS in dev, so the cookie name is the plain `session`.

- [ ] **Step 1: Write the failing test**

`src/server/auth/cookie.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/server/auth/cookie.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/server/auth/cookie.ts`:
```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/server/auth/cookie.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/server/auth/cookie.ts src/server/auth/cookie.test.ts
git commit -m "feat(auth): session cookie utilities"
```

---

### Task 4: Session DB layer (Prisma)

**Files:**
- Create: `src/server/auth/session.ts`
- Test: `src/server/auth/session.test.ts`

**Interfaces:**
- Consumes: `prisma` from `#/db` (Task 1 added `Session`/`User`).
- Produces:
  - `createSession(userId: string): Promise<{ id: string; expiresAt: Date }>` — creates a row, also returns it; caller sets the cookie.
  - `getSessionWithUser(id: string): Promise<{ id: string; expiresAt: Date; user: { id: string; email: string } } | null>`
  - `deleteSession(id: string): Promise<void>`

- [ ] **Step 1: Write the failing integration test**

`src/server/auth/session.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '#/db'
import { hashPassword } from './password'
import { createSession, getSessionWithUser, deleteSession } from './session'

afterEach(async () => {
  await prisma.session.deleteMany({})
  await prisma.user.deleteMany({})
})

describe('session db', () => {
  it('creates, reads, and deletes a session for a user', async () => {
    const user = await prisma.user.create({
      data: { email: `t${Math.random()}@x.test`, passwordHash: await hashPassword('x') },
    })
    const session = await createSession(user.id)
    expect(session.id).toBeTruthy()

    const got = await getSessionWithUser(session.id)
    expect(got?.user.email).toBe(user.email)
    expect(got?.expiresAt.getTime()).toBeGreaterThan(Date.now())

    await deleteSession(session.id)
    expect(await getSessionWithUser(session.id)).toBeNull()
  })

  it('returns null for an unknown session', async () => {
    expect(await getSessionWithUser('does-not-exist')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/server/auth/session.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/server/auth/session.ts`:
```ts
import { prisma } from '#/db'

const ONE_DAY_MS = 1000 * 60 * 60 * 24

export async function createSession(userId: string) {
  return prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + ONE_DAY_MS),
    },
    select: { id: true, expiresAt: true },
  })
}

export async function getSessionWithUser(id: string) {
  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, expiresAt: true, user: { select: { id: true, email: true } } },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id } }).catch(() => {})
    return null
  }
  return session
}

export async function deleteSession(id: string): Promise<void> {
  await prisma.session.delete({ where: { id } }).catch(() => {})
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/server/auth/session.test.ts
```
Expected: PASS (2 tests). (Requires `DATABASE_URL` to be set in `.env.local`.)

- [ ] **Step 5: Commit**
```bash
git add src/server/auth/session.ts src/server/auth/session.test.ts
git commit -m "feat(auth): session DB layer"
```

---

### Task 5: Auth middleware + `getCurrentUser`

**Files:**
- Create: `src/server/auth/middleware.ts`
- Test: `src/server/auth/middleware.test.ts`

**Interfaces:**
- Consumes: `readSessionId`, `getSessionWithUser` (Tasks 3–4); `getRequestHeader` from `@tanstack/react-start/server`.
- Produces:
  - `authMiddleware` — server-function middleware that injects `context.user: { id: string; email: string } | null`.
  - `getCurrentUser` — `createServerFn({ method: 'GET' }).middleware([authMiddleware]).handler(({ context }) => context.user)`.

- [ ] **Step 1: Write the failing test (pure logic: `resolveUserFromCookie`)**

To keep this unit-testable without a server harness, factor the resolution into a pure helper and test that.

`src/server/auth/middleware.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/server/auth/middleware.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/server/auth/middleware.ts`:
```ts
import { createServerFn } from '@tanstack/react-start'
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
```

> Add `vi.mock('./session')` at the top of the test file is **not** needed because the test stubs `getSessionWithUser` via `vi.mocked` after dynamically importing it. If the run complains that the module isn't mocked, add at the file top: `vi.mock('./session', () => ({ getSessionWithUser: vi.fn() }))`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/server/auth/middleware.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/server/auth/middleware.ts src/server/auth/middleware.test.ts
git commit -m "feat(auth): auth middleware and getCurrentUser"
```

---

### Task 6: `register` server function

**Files:**
- Create: `src/server/auth/functions.ts`
- Test: `src/server/auth/functions.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 2), `createSession` (Task 4), `buildSessionCookie` (Task 3), `prisma` from `#/db`, `setResponseHeader` from `@tanstack/react-start/server`.
- Produces: `register({ data: { email, password } })` → creates User + Session, sets the `Set-Cookie` header, returns `{ id, email }`. Throws on duplicate email.

- [ ] **Step 1: Write the failing integration test**

`src/server/auth/functions.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { prisma } from '#/db'
import { register, login, logout } from './functions'

// capture Set-Cookie writes
let setCookie: string[] = []
vi.mock('@tanstack/react-start/server', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-start/server')>('@tanstack/react-start/server')
  return {
    ...actual,
    setResponseHeader: (k: string, v: string) => { if (k === 'Set-Cookie') setCookie.push(v) },
    getRequestHeader: () => null, // no session by default
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/server/auth/functions.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement (register only; login/logout come in Tasks 7–8)**

`src/server/auth/functions.ts`:
```ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { setResponseHeader } from '@tanstack/react-start/server'
import { prisma } from '#/db'
import { hashPassword, verifyPassword } from './password'
import { buildSessionCookie, buildClearCookie, readSessionId } from './cookie'
import { createSession, deleteSession, getSessionWithUser } from './session'

const credentials = z.object({ email: z.string().email(), password: z.string().min(8) })

export const register = createServerFn({ method: 'POST' })
  .validator(credentials)
  .handler(async ({ data }) => {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) throw new Error('Email already registered')
    const user = await prisma.user.create({
      data: { email: data.email, passwordHash: await hashPassword(data.password) },
    })
    const session = await createSession(user.id)
    setResponseHeader('Set-Cookie', buildSessionCookie(session.id))
    return { id: user.id, email: user.email }
  })
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/server/auth/functions.test.ts
```
Expected: PASS (the 2 register tests). The login/logout tests (added next) still don't exist yet, so vitest runs only register's.

- [ ] **Step 5: Commit**
```bash
git add src/server/auth/functions.ts src/server/auth/functions.test.ts
git commit -m "feat(auth): register server function"
```

---

### Task 7: `login` server function

**Files:**
- Modify: `src/server/auth/functions.ts` (append `login`)
- Test: `src/server/auth/functions.test.ts` (append tests)

**Interfaces:**
- Produces: `login({ data: { email, password } })` → verifies credentials, issues a session cookie, returns `{ id, email }`. Throws on bad credentials (same generic message either way).

- [ ] **Step 1: Append the failing test**

Append to `src/server/auth/functions.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/server/auth/functions.test.ts
```
Expected: FAIL (`login is not defined`).

- [ ] **Step 3: Implement — append to `src/server/auth/functions.ts`**

```ts
export const login = createServerFn({ method: 'POST' })
  .validator(credentials)
  .handler(async ({ data }) => {
    const user = await prisma.user.findUnique({ where: { email: data.email } })
    const ok = user ? await verifyPassword(data.password, user.passwordHash) : false
    if (!user || !ok) throw new Error('Invalid email or password')
    const session = await createSession(user.id)
    setResponseHeader('Set-Cookie', buildSessionCookie(session.id))
    return { id: user.id, email: user.email }
  })
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/server/auth/functions.test.ts
```
Expected: PASS (register + login tests).

- [ ] **Step 5: Commit**
```bash
git add src/server/auth/functions.ts src/server/auth/functions.test.ts
git commit -m "feat(auth): login server function"
```

---

### Task 8: `logout` server function

**Files:**
- Modify: `src/server/auth/functions.ts` (append `logout`)
- Test: `src/server/auth/functions.test.ts` (append test)

**Interfaces:**
- Produces: `logout()` → deletes the session referenced by the cookie, clears the cookie.

- [ ] **Step 1: Append the failing test**

Append to `src/server/auth/functions.test.ts`:
```ts
import { getRequestHeader } from '@tanstack/react-start/server'

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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/server/auth/functions.test.ts
```
Expected: FAIL (`logout is not defined`).

- [ ] **Step 3: Implement — append to `src/server/auth/functions.ts`**

```ts
import { getRequestHeader } from '@tanstack/react-start/server'

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const sessionId = readSessionId(getRequestHeader('cookie'))
  if (sessionId) await deleteSession(sessionId)
  setResponseHeader('Set-Cookie', buildClearCookie())
  return { ok: true }
})
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/server/auth/functions.test.ts
```
Expected: PASS (all auth tests).

- [ ] **Step 5: Run the whole suite + lint, then commit**
```bash
bunx vitest run && bun run lint
git add src/server/auth/functions.ts src/server/auth/functions.test.ts
git commit -m "feat(auth): logout server function"
```

---

### Task 9: `/register` page

**Files:**
- Create: `src/routes/register.tsx`

**Interfaces:**
- Consumes: `register` from `#/server/auth/functions`; `useNavigate`, `createFileRoute` from `@tanstack/react-router`.

- [ ] **Step 1: Create the page**

`src/routes/register.tsx`:
```tsx
import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { register } from '#/server/auth/functions'

export const Route = createFileRoute('/register')({ component: RegisterPage })

function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await register({ data: { email, password } })
      navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <h1 className="demo-title mb-4 text-center">Create account</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input className="demo-input" type="email" required placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="demo-input" type="password" required placeholder="Password (min 8)" minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="demo-button" type="submit">Register</button>
        </form>
        <p className="demo-muted mt-4 text-center text-sm">
          Have an account? <Link to="/login" className="text-[var(--lagoon-deep)] underline">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Regenerate routes + run lint**

```bash
bun run generate-routes && bun run lint
```
Expected: lint passes; `/register` route appears in `src/routeTree.gen.ts`.

- [ ] **Step 3: Commit**
```bash
git add src/routes/register.tsx src/routeTree.gen.ts
git commit -m "feat(auth): /register page"
```

---

### Task 10: `/login` page

**Files:**
- Create: `src/routes/login.tsx`

- [ ] **Step 1: Create the page**

`src/routes/login.tsx`:
```tsx
import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { login } from '#/server/auth/functions'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login({ data: { email, password } })
      navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <h1 className="demo-title mb-4 text-center">Sign in</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input className="demo-input" type="email" required placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="demo-input" type="password" required placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="demo-button" type="submit">Sign in</button>
        </form>
        <p className="demo-muted mt-4 text-center text-sm">
          No account? <Link to="/register" className="text-[var(--lagoon-deep)] underline">Register</Link>
        </p>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Regenerate routes + lint**
```bash
bun run generate-routes && bun run lint
```
Expected: lint passes.

- [ ] **Step 3: Commit**
```bash
git add src/routes/login.tsx src/routeTree.gen.ts
git commit -m "feat(auth): /login page"
```

---

### Task 11: `_authenticated` layout + `/app` protected page

**Files:**
- Create: `src/routes/_authenticated.tsx`
- Create: `src/routes/_authenticated/app.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` from `#/server/auth/middleware`; `logout` from `#/server/auth/functions`; `redirect`, `createFileRoute`, `Link` from `@tanstack/react-router`.

- [ ] **Step 1: Create the layout guard**

`src/routes/_authenticated.tsx`:
```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCurrentUser } from '#/server/auth/middleware'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { user }
  },
})
```

- [ ] **Step 2: Create the protected home**

`src/routes/_authenticated/app.tsx`:
```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { logout } from '#/server/auth/functions'

export const Route = createFileRoute('/_authenticated/app')({ component: AppHome })

function AppHome() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()

  async function onLogout() {
    await logout()
    navigate({ to: '/login' })
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <p className="island-kicker mb-2">FormHarbor</p>
        <h1 className="demo-title mb-3">Signed in</h1>
        <p className="demo-muted mb-6 text-sm">You are {user.email}.</p>
        <button className="demo-button" onClick={onLogout}>Sign out</button>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Also send visitors at `/` to `/app` or `/login`**

Modify `src/routes/index.tsx` is out of scope to keep the existing landing; instead add a tiny redirect route so `/app` (without the layout) isn't needed. (The `_authenticated/app` route above already serves `/app`.) No change required.

- [ ] **Step 4: Regenerate routes + lint**
```bash
bun run generate-routes && bun run lint
```
Expected: lint passes.

- [ ] **Step 5: Commit**
```bash
git add src/routes/_authenticated.tsx src/routes/_authenticated/app.tsx src/routeTree.gen.ts
git commit -m "feat(auth): _authenticated guard and /app"
```

---

### Task 12: Remove WorkOS provider + smoke test

**Files:**
- Modify: `src/routes/__root.tsx` (drop `WorkOSProvider`)
- Modify: `src/components/Header.tsx` (drop the WorkOS header import/usage — see its current `WorkOSHeader`)
- Delete: `src/integrations/workos/` directory
- Modify: `.env.local`, `.env.example` (drop `VITE_WORKOS_CLIENT_ID` / `VITE_WORKOS_API_HOSTNAME`)

- [ ] **Step 1: Unwrap `WorkOSProvider` in `__root.tsx`**

In `src/routes/__root.tsx`, remove the `import WorkOSProvider from '../integrations/workos/provider'` line and replace `<WorkOSProvider>...</WorkOSProvider>` so its children sit directly under `<body>`:
```tsx
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <Header />
        {children}
        <Footer />
        <TanStackDevtools ... />
        <Scripts />
      </body>
```

- [ ] **Step 2: Remove the WorkOS header bits**

In `src/components/Header.tsx`, remove `import WorkOSHeader from './workos-user.tsx'` and the `<WorkOSHeader />` usage (keep the rest of the nav).

- [ ] **Step 3: Delete the integration + the WorkOS demo route**

```bash
rm -rf src/integrations/workos
rm -f src/routes/demo/workos.tsx src/components/workos-user.tsx
```

- [ ] **Step 4: Drop WorkOS env vars**

In `.env.local` and `.env.example`, remove the `VITE_WORKOS_CLIENT_ID` / `VITE_WORKOS_API_HOSTNAME` lines (and their comments).

- [ ] **Step 5: Build + run the suite**
```bash
bun run generate-routes && bun run lint && bun run build && bunx vitest run
```
Expected: all green.

- [ ] **Step 6: Manual smoke test**

```bash
bun run dev
```
Then in a browser:
1. Open `/app` → redirected to `/login`.
2. Go to `/register`, create an account → lands on `/app` showing the email.
3. Click "Sign out" → back to `/login`.
4. `/login` with the new account → `/app` again.
5. Restart `bun run dev` (session persists via cookie) → `/app` still shows the user.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "feat(auth): drop WorkOS provider; M0 auth complete"
```

---

## Self-Review (run after writing — results recorded here)

- **Spec coverage:** Auth foundation (register/login/logout, session, current user, guarded `/app`) — Tasks 1–12. WorkOS removal — Task 12. PBKDF2 + HttpOnly cookie + `process.env`/cookie reads inside handlers — covered. ✓
- **Placeholder scan:** none; every code step has the actual code. ✓
- **Type consistency:** `hashPassword/verifyPassword`, `SESSION_COOKIE/readSessionId/buildSessionCookie/buildClearCookie`, `createSession/getSessionWithUser/deleteSession`, `authMiddleware/getCurrentUser/resolveUserFromCookie`, `register/login/logout` — names match across tasks. ✓ (Task 8 re-imports `getRequestHeader` — fine, deduped by the bundler.)
