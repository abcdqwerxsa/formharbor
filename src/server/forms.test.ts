import { describe, it, expect, afterEach } from 'vitest'
import { getPrisma } from '#/db'
import { ensureOrgForUser } from './org'
import type { OrgMembership } from './org'
import { createForm, listForms, getForm, updateForm, deleteForm } from './forms'

async function setupOrg(email: string): Promise<{ userId: string; org: OrgMembership }> {
  const prisma = await getPrisma()
  const user = await prisma.user.create({ data: { email, passwordHash: 'x' } })
  const org = await ensureOrgForUser(user.id, user.email)
  return { userId: user.id, org }
}

afterEach(async () => {
  const prisma = await getPrisma()
  await prisma.form.deleteMany({})
  await prisma.membership.deleteMany({})
  await prisma.organization.deleteMany({})
  await prisma.user.deleteMany({})
})

describe('createForm', () => {
  it('creates a DRAFT form with empty fields and a slug derived from the name', async () => {
    const { org } = await setupOrg(`cf${Math.random()}@x.test`)
    const form = await createForm(org.id, { name: 'Contact Us' })
    expect(form.orgId).toBe(org.id)
    expect(form.status).toBe('DRAFT')
    expect(form.fields).toEqual([])
    expect(form.slug).toMatch(/^contact-us-/)
  })

  it('produces unique slugs for two same-named forms in the same org', async () => {
    const { org } = await setupOrg(`us${Math.random()}@x.test`)
    const a = await createForm(org.id, { name: 'Signup' })
    const b = await createForm(org.id, { name: 'Signup' })
    expect(a.slug).not.toBe(b.slug)
  })
})

describe('listForms', () => {
  it('lists forms in the org', async () => {
    const { org } = await setupOrg(`lf${Math.random()}@x.test`)
    await createForm(org.id, { name: 'B' })
    await createForm(org.id, { name: 'A' })
    const names = (await listForms(org.id)).map((f) => f.name).sort()
    expect(names).toEqual(['A', 'B'])
  })
})

describe('getForm ownership', () => {
  it("returns null for another org's form (no existence leak)", async () => {
    const a = await setupOrg(`ga${Math.random()}@x.test`)
    const b = await setupOrg(`gb${Math.random()}@x.test`)
    const form = await createForm(a.org.id, { name: 'Private' })
    expect(await getForm(b.org.id, form.id)).toBeNull()
    expect(await getForm(a.org.id, form.id)).not.toBeNull()
  })
})

describe('updateForm', () => {
  it('updates name, fields, and status', async () => {
    const { org } = await setupOrg(`uf${Math.random()}@x.test`)
    const form = await createForm(org.id, { name: 'Old' })
    const updated = await updateForm(org.id, form.id, {
      formId: form.id,
      name: 'New',
      fields: [{ id: 'f_1', type: 'text', label: 'Name', required: true }],
      status: 'OPEN',
      settings: {},
    })
    expect(updated.name).toBe('New')
    expect(updated.status).toBe('OPEN')
    expect(updated.fields.length).toBe(1)
  })

  it('throws 404 when the form belongs to another org', async () => {
    const a = await setupOrg(`ua${Math.random()}@x.test`)
    const b = await setupOrg(`ub${Math.random()}@x.test`)
    const form = await createForm(a.org.id, { name: 'X' })
    await expect(
      updateForm(b.org.id, form.id, {
        formId: form.id,
        name: 'X',
        fields: [],
        status: 'DRAFT',
        settings: {},
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('deleteForm', () => {
  it('deletes the form', async () => {
    const { org } = await setupOrg(`df${Math.random()}@x.test`)
    const form = await createForm(org.id, { name: 'Gone' })
    await deleteForm(org.id, form.id)
    expect(await getForm(org.id, form.id)).toBeNull()
  })

  it('throws 404 and does NOT delete when the form belongs to another org', async () => {
    const a = await setupOrg(`da${Math.random()}@x.test`)
    const b = await setupOrg(`db${Math.random()}@x.test`)
    const form = await createForm(a.org.id, { name: 'Keep' })
    await expect(deleteForm(b.org.id, form.id)).rejects.toMatchObject({ status: 404 })
    expect(await getForm(a.org.id, form.id)).not.toBeNull()
  })
})
