import '@tanstack/react-start/server-only'
import type { Form as PrismaForm } from '#/generated/prisma/client'
import type { Field, FormSettings } from '#/forms/schema'
import { fieldsToZodSchema } from '#/forms/schema'
import type { FormRecord } from '#/server/forms'

function toRecord(f: PrismaForm): FormRecord {
  return { ...f, fields: f.fields as Field[], settings: f.settings as FormSettings }
}

function notFound(): Error {
  const err = new Error('Not found')
  // @ts-expect-error -- augment with an HTTP-ish status for the caller/router
  err.status = 404
  return err
}

export type SubmissionRow = {
  id: string
  data: unknown
  ip: string | null
  userAgent: string | null
  createdAt: Date
}

/** Look up an OPEN form by org slug + form slug (public). */
export async function getFormBySlug(
  orgSlug: string,
  formSlug: string,
): Promise<FormRecord | null> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const form = await prisma.form.findFirst({
    where: { slug: formSlug, org: { slug: orgSlug }, status: 'OPEN' },
  })
  return form ? toRecord(form) : null
}

/** Public submission: validate values against the form's fields, then persist. */
export async function createSubmission(input: {
  orgSlug: string
  formSlug: string
  values: Record<string, unknown>
  meta?: { ip?: string | null; userAgent?: string | null }
}): Promise<{ id: string }> {
  const form = await getFormBySlug(input.orgSlug, input.formSlug)
  if (!form) throw notFound()
  const values = fieldsToZodSchema(form.fields).parse(input.values)
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const sub = await prisma.submission.create({
    data: {
      formId: form.id,
      orgId: form.orgId,
      data: values,
      ip: input.meta?.ip ?? null,
      userAgent: input.meta?.userAgent ?? null,
    },
    select: { id: true },
  })
  return { id: sub.id }
}

/** Admin browse: a form's submissions (empty if the form isn't in this org). */
export async function listSubmissions(
  orgId: string,
  formId: string,
): Promise<SubmissionRow[]> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { orgId: true },
  })
  if (!form || form.orgId !== orgId) return []
  return prisma.submission.findMany({
    where: { formId },
    select: { id: true, data: true, ip: true, userAgent: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}
