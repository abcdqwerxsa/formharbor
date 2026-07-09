import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { orgMiddleware } from '#/server/auth/org-middleware'
import { createFormInput, updateFormInput } from '#/forms/schema'

// `./forms` (the service) is server-only — it lazily imports `#/db`. Import it
// lazily inside handlers so this client-imported module never leaks `pg`/Prisma
// into the client bundle (same discipline as auth/functions.ts). A top-level
// value import here would fail `vite build` with UNLOADABLE_DEPENDENCY.

function requireOrg(context: { currentOrg: { id: string } | null }): { id: string } {
  if (!context.currentOrg) throw new Error('No current org context')
  return context.currentOrg
}

export const listOrgForms = createServerFn({ method: 'GET' })
  .middleware([orgMiddleware])
  .handler(async ({ context }) => {
    const { listForms } = await import('./forms')
    return listForms(requireOrg(context).id)
  })

export const getOrgForm = createServerFn({ method: 'GET' })
  .validator(z.object({ formId: z.string().min(1) }))
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { getForm } = await import('./forms')
    return getForm(requireOrg(context).id, data.formId)
  })

export const createOrgForm = createServerFn({ method: 'POST' })
  .validator(createFormInput)
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { createForm } = await import('./forms')
    return createForm(requireOrg(context).id, data)
  })

export const updateOrgForm = createServerFn({ method: 'POST' })
  .validator(updateFormInput)
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { updateForm } = await import('./forms')
    return updateForm(requireOrg(context).id, data.formId, data)
  })

export const deleteOrgForm = createServerFn({ method: 'POST' })
  .validator(z.object({ formId: z.string().min(1) }))
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { deleteForm } = await import('./forms')
    await deleteForm(requireOrg(context).id, data.formId)
    return { ok: true }
  })
