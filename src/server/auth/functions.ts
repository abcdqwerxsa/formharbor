import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { setResponseHeader, getRequestHeader } from '@tanstack/react-start/server'
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

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const sessionId = readSessionId(getRequestHeader('cookie'))
  if (sessionId) await deleteSession(sessionId)
  setResponseHeader('Set-Cookie', buildClearCookie())
  return { ok: true }
})
