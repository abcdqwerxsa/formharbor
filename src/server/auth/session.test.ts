import { describe, it, expect, afterEach } from 'vitest'
import { getPrisma } from '#/db'
import { hashPassword } from './password'
import { createSession, getSessionWithUser, deleteSession } from './session'

afterEach(async () => {
  const prisma = await getPrisma()
  await prisma.session.deleteMany({})
  await prisma.user.deleteMany({})
})

describe('session db', () => {
  // CockroachDB (remote) is slow on a cold connection; allow up to 30s per test.
  it(
    'creates, reads, and deletes a session for a user',
    async () => {
      const prisma = await getPrisma()
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
    },
    30_000,
  )

  it(
    'returns null for an unknown session',
    async () => {
      expect(await getSessionWithUser('does-not-exist')).toBeNull()
    },
    30_000,
  )
})
