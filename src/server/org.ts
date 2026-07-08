import '@tanstack/react-start/server-only'

export type OrgMembership = {
  id: string
  name: string
  slug: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
}

/**
 * Build a unique org slug from an email's local-part.
 *
 * Normalizes the local-part to lowercase `[a-z0-9]+` (strips dots, `+`, etc.),
 * then appends a short random suffix so two users with the same local-part
 * (e.g. `jeanpaul@x.test` and `jeanpaul@other.test`) get distinct slugs.
 * Retries with a new suffix on a slug collision.
 *
 * Example: `Jean.Paul+work@x.test` -> `jeanpaul-1d2e3`
 */
function buildSlugFromEmail(localPart: string): string {
  const base = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
  const safeBase = base || 'org'
  const suffix = Math.random().toString(36).slice(2, 7) // ~5 chars [a-z0-9]
  return `${safeBase}-${suffix}`
}

/**
 * Ensure a user has at least one organization. If they already have a
 * membership, return the first one (idempotent). Otherwise create a default
 * org (named after the email's local-part) with an OWNER membership.
 */
export async function ensureOrgForUser(
  userId: string,
  email: string,
): Promise<OrgMembership> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()

  const existing = await prisma.membership.findFirst({
    where: { userId },
    select: {
      role: true,
      org: { select: { id: true, name: true, slug: true } },
    },
  })
  if (existing) {
    return {
      id: existing.org.id,
      name: existing.org.name,
      slug: existing.org.slug,
      role: existing.role,
    }
  }

  const localPart = email.split('@')[0] ?? 'user'
  const displayName = localPart.replace(/[._+-]+/g, ' ').trim() || localPart
  const baseName = displayName.charAt(0).toUpperCase() + displayName.slice(1)

  // generate a unique slug (retry on the rare collision)
  let slug = buildSlugFromEmail(localPart)
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!clash) break
    slug = buildSlugFromEmail(localPart)
  }

  const org = await prisma.organization.create({
    data: {
      name: `${baseName}'s Org`,
      slug,
      memberships: {
        create: { userId, role: 'OWNER' },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      memberships: { select: { role: true }, take: 1 },
    },
  })

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role: org.memberships[0]?.role ?? 'OWNER',
  }
}

/**
 * List all organizations a user is a member of, with their role in each.
 */
export async function listOrgsForUser(
  userId: string,
): Promise<OrgMembership[]> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      role: true,
      org: { select: { id: true, name: true, slug: true } },
    },
  })

  return memberships.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    role: m.role,
  }))
}
