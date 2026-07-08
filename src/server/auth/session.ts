import '@tanstack/react-start/server-only'
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
