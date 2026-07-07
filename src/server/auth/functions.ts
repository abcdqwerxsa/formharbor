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
