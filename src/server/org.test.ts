import { describe, it, expect, afterEach } from 'vitest'
import { getPrisma } from '#/db'
import { ensureOrgForUser, listOrgsForUser } from './org'

afterEach(async () => {
  const prisma = await getPrisma()
  // order matters: memberships reference users+orgs (cascade onDelete, but be explicit)
  await prisma.membership.deleteMany({})
  await prisma.organization.deleteMany({})
  await prisma.user.deleteMany({})
})

describe('ensureOrgForUser', () => {
  it('creates a default org with OWNER role and a unique slug for a new user', async () => {
    const prisma = await getPrisma()
    const email = `jeanpaul.${Math.random().toString(36).slice(2, 8)}@x.test`
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x' },
    })

    const org = await ensureOrgForUser(user.id, email)
    expect(org.role).toBe('OWNER')
    expect(org.name).toBeTruthy()
    // slug derived from email local-part, plus a random suffix
    expect(org.slug).toMatch(/^[a-z0-9]+-[a-z0-9]{4,}$/)
    expect(org.slug.startsWith('jeanpaul')).toBe(true)
    expect(org.id).toBeTruthy()

    // persisted
    const dbOrg = await prisma.organization.findUnique({
      where: { slug: org.slug },
    })
    expect(dbOrg).not.toBeNull()
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
    })
    expect(membership?.role).toBe('OWNER')
  }, 30_000)

  it('is idempotent: calling twice for the same user returns the same org, no second org', async () => {
    const prisma = await getPrisma()
    const email = `idem.${Math.random().toString(36).slice(2, 8)}@x.test`
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x' },
    })

    const first = await ensureOrgForUser(user.id, email)
    const second = await ensureOrgForUser(user.id, email)

    expect(second.id).toBe(first.id)
    expect(second.slug).toBe(first.slug)
    // still exactly one org + one membership for this user
    expect(await prisma.organization.count()).toBe(1)
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(
      1,
    )
  }, 30_000)

  it('generates unique slugs for two different users with the same local-part', async () => {
    const prisma = await getPrisma()
    const localPart = `dupe${Math.random().toString(36).slice(2, 6)}`
    const u1 = await prisma.user.create({
      data: { email: `${localPart}@x.test`, passwordHash: 'x' },
    })
    const u2 = await prisma.user.create({
      data: { email: `${localPart}@other.test`, passwordHash: 'x' },
    })

    const o1 = await ensureOrgForUser(u1.id, `${localPart}@x.test`)
    const o2 = await ensureOrgForUser(u2.id, `${localPart}@other.test`)

    expect(o1.slug).not.toBe(o2.slug)
  }, 30_000)
})

describe('listOrgsForUser', () => {
  it('returns the orgs the user is a member of, with role', async () => {
    const prisma = await getPrisma()
    const email = `list.${Math.random().toString(36).slice(2, 8)}@x.test`
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x' },
    })
    const org = await ensureOrgForUser(user.id, email)

    const orgs = await listOrgsForUser(user.id)
    expect(orgs).toHaveLength(1)
    expect(orgs[0].id).toBe(org.id)
    expect(orgs[0].role).toBe('OWNER')
    expect(orgs[0].name).toBe(org.name)
    expect(orgs[0].slug).toBe(org.slug)

    // a user with no orgs returns an empty list
    const other = await prisma.user.create({
      data: { email: `none.${Math.random()}@x.test`, passwordHash: 'x' },
    })
    expect(await listOrgsForUser(other.id)).toEqual([])
  }, 30_000)
})
