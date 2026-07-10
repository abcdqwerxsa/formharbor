import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { orgMiddleware } from '#/server/auth/org-middleware'
import { createFormInput, updateFormInput } from '#/forms/schema'

// `#/server/forms` (the service) is server-only — it lazily imports `#/db`.
// Import it lazily inside handlers so this client-imported module never leaks
// `pg`/Prisma into the client bundle (same discipline as auth/functions.ts).
// We use the `#/` alias (not a relative `./forms`) because (a) the service file
// `src/server/forms.ts` collides with this directory `src/server/forms/`, and
// (b) TanStack Start's `?tss-serverfn-split` virtual module doesn't resolve
// relative imports reliably. The alias resolves via tsconfig paths either way.

function requireOrg(context: { currentOrg: { id: string } | null }): { id: string } {
  if (!context.currentOrg) throw new Error('No current org context')
  return context.currentOrg
}

export const listOrgForms = createServerFn({ method: 'GET' })
  .middleware([orgMiddleware])
  .handler(async ({ context }) => {
    const { listForms } = await import('#/server/forms')
    return listForms(requireOrg(context).id)
  })

export const getOrgForm = createServerFn({ method: 'GET' })
  .validator(z.object({ formId: z.string().min(1) }))
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { getForm } = await import('#/server/forms')
    return getForm(requireOrg(context).id, data.formId)
  })

export const createOrgForm = createServerFn({ method: 'POST' })
  .validator(createFormInput)
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { createForm } = await import('#/server/forms')
    return createForm(requireOrg(context).id, data)
  })

export const updateOrgForm = createServerFn({ method: 'POST' })
  .validator(updateFormInput)
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { updateForm } = await import('#/server/forms')
    return updateForm(requireOrg(context).id, data.formId, data)
  })

export const deleteOrgForm = createServerFn({ method: 'POST' })
  .validator(z.object({ formId: z.string().min(1) }))
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { deleteForm } = await import('#/server/forms')
    await deleteForm(requireOrg(context).id, data.formId)
    return { ok: true }
  })
