import { describe, it, expect, afterEach } from 'vitest'
import { getPrisma } from '#/db'
import { ensureOrgForUser } from './org'
import type { OrgMembership } from './org'
import type { Field } from '#/forms/schema'
import { getFormBySlug, createSubmission, listSubmissions } from './submissions'

const rand = () => Math.random().toString(36).slice(2, 8)

async function setupOpenForm(
  email: string,
  fields: Field[] = [],
): Promise<{ org: OrgMembership; form: { id: string; slug: string } }> {
  const prisma = await getPrisma()
  const user = await prisma.user.create({ data: { email, passwordHash: 'x' } })
  const org = await ensureOrgForUser(user.id, user.email)
  const form = await prisma.form.create({
    data: { orgId: org.id, name: 'F', slug: `f-${rand()}`, status: 'OPEN', fields, settings: {} },
  })
  return { org, form }
}

afterEach(async () => {
  const prisma = await getPrisma()
  await prisma.submission.deleteMany({})
  await prisma.form.deleteMany({})
  await prisma.membership.deleteMany({})
  await prisma.organization.deleteMany({})
  await prisma.user.deleteMany({})
})

describe('getFormBySlug', () => {
  it('finds an OPEN form', async () => {
    const { org, form } = await setupOpenForm(`gf${rand()}@x.test`)
    expect(await getFormBySlug(org.slug, form.slug)).not.toBeNull()
  })

  it('returns null for a DRAFT form', async () => {
    const { org } = await setupOpenForm(`gd${rand()}@x.test`)
    const prisma = await getPrisma()
    const draft = await prisma.form.create({
      data: { orgId: org.id, name: 'D', slug: `d-${rand()}`, status: 'DRAFT', fields: [], settings: {} },
    })
    expect(await getFormBySlug(org.slug, draft.slug)).toBeNull()
  })

  it('returns null for a wrong org slug', async () => {
    const { form } = await setupOpenForm(`gw${rand()}@x.test`)
    expect(await getFormBySlug('no-such-org', form.slug)).toBeNull()
  })
})

describe('createSubmission', () => {
  it('validates and persists a submission', async () => {
    const { org, form } = await setupOpenForm(`cs${rand()}@x.test`, [
      { id: 'f1', type: 'text', label: 'Name', required: true },
    ])
    const { id } = await createSubmission({
      orgSlug: org.slug,
      formSlug: form.slug,
      values: { f1: 'Alice' },
    })
    expect(id).toBeTruthy()
    const prisma = await getPrisma()
    const sub = await prisma.submission.findUnique({ where: { id } })
    expect((sub!.data as Record<string, unknown>).f1).toBe('Alice')
  })

  it('throws when a required field is missing', async () => {
    const { org, form } = await setupOpenForm(`cm${rand()}@x.test`, [
      { id: 'f1', type: 'text', label: 'Name', required: true },
    ])
    await expect(
      createSubmission({ orgSlug: org.slug, formSlug: form.slug, values: {} }),
    ).rejects.toThrow()
  })

  it('throws (404) for a non-OPEN form', async () => {
    const { org, form } = await setupOpenForm(`cn${rand()}@x.test`)
    const prisma = await getPrisma()
    await prisma.form.update({ where: { id: form.id }, data: { status: 'CLOSED' } })
    await expect(
      createSubmission({ orgSlug: org.slug, formSlug: form.slug, values: {} }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('listSubmissions', () => {
  it('lists the form submissions, newest first', async () => {
    const { org, form } = await setupOpenForm(`ls${rand()}@x.test`)
    await createSubmission({ orgSlug: org.slug, formSlug: form.slug, values: {} })
    const list = await listSubmissions(org.id, form.id)
    expect(list.length).toBe(1)
  })

  it('returns [] for another org (no leak)', async () => {
    const { org, form } = await setupOpenForm(`lo${rand()}@x.test`)
    await createSubmission({ orgSlug: org.slug, formSlug: form.slug, values: {} })
    const prisma = await getPrisma()
    const other = await prisma.user.create({ data: { email: `ox${rand()}@x.test`, passwordHash: 'x' } })
    const otherOrg = await ensureOrgForUser(other.id, other.email)
    expect(await listSubmissions(otherOrg.id, form.id)).toEqual([])
  })
})
