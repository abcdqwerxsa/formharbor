import '@tanstack/react-start/server-only'
import type { Form as PrismaForm } from '#/generated/prisma/client'
import type { Field, FormSettings, FormStatus, UpdateFormInput } from '#/forms/schema'

export type FormRecord = Omit<PrismaForm, 'fields' | 'settings'> & {
  fields: Field[]
  settings: FormSettings
}

function toRecord(f: PrismaForm): FormRecord {
  return { ...f, fields: f.fields as Field[], settings: f.settings as FormSettings }
}

/** lowercase [a-z0-9-], trimmed, with a short random suffix for uniqueness */
export function buildSlugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const safeBase = base || 'form'
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${safeBase}-${suffix}`
}

async function uniqueSlug(orgId: string, name: string) {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = buildSlugFromName(name)
    const clash = await prisma.form.findUnique({
      where: { orgId_slug: { orgId, slug } },
      select: { id: true },
    })
    if (!clash) return slug
  }
  return `${buildSlugFromName(name)}${Math.random().toString(36).slice(2, 11)}`
}

function notFound(): Error {
  const err = new Error('Not found')
  // @ts-expect-error -- augment with an HTTP-ish status for the caller/router
  err.status = 404
  return err
}

export async function createForm(
  orgId: string,
  input: { name: string },
): Promise<FormRecord> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const slug = await uniqueSlug(orgId, input.name)
  const form = await prisma.form.create({
    data: {
      orgId,
      name: input.name,
      slug,
      status: 'DRAFT',
      fields: [],
      settings: {},
    },
  })
  return toRecord(form)
}

export async function listForms(
  orgId: string,
): Promise<
  Array<{ id: string; name: string; slug: string; status: FormStatus; updatedAt: Date }>
> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  return prisma.form.findMany({
    where: { orgId },
    select: { id: true, name: true, slug: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function getForm(
  orgId: string,
  formId: string,
): Promise<FormRecord | null> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const form = await prisma.form.findUnique({ where: { id: formId } })
  if (!form || form.orgId !== orgId) return null // no existence leak
  return toRecord(form)
}

export async function updateForm(
  orgId: string,
  formId: string,
  input: UpdateFormInput,
): Promise<FormRecord> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const existing = await prisma.form.findUnique({ where: { id: formId } })
  if (!existing || existing.orgId !== orgId) throw notFound()

  // recompute the slug only if the name actually changed
  const slug =
    existing.name === input.name ? existing.slug : await uniqueSlug(orgId, input.name)

  const form = await prisma.form.update({
    where: { id: formId },
    data: {
      name: input.name,
      slug,
      status: input.status,
      fields: input.fields,
      settings: input.settings,
    },
  })
  return toRecord(form)
}

export async function deleteForm(orgId: string, formId: string): Promise<void> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const existing = await prisma.form.findUnique({ where: { id: formId } })
  if (!existing || existing.orgId !== orgId) throw notFound()
  await prisma.form.delete({ where: { id: formId } })
}
