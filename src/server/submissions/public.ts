import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Public form endpoint — NO auth middleware. The service is imported lazily via
// the `#/server/submissions` alias (relative imports fail in tss-serverfn-split,
// and submissions.ts (service) collides with the submissions/ directory).

export const getPublicForm = createServerFn({ method: 'GET' })
  .validator(z.object({ orgSlug: z.string().min(1), formSlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { getFormBySlug } = await import('#/server/submissions')
    const form = await getFormBySlug(data.orgSlug, data.formSlug)
    if (!form) return null
    return { name: form.name, fields: form.fields }
  })

export const submitSubmission = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      orgSlug: z.string().min(1),
      formSlug: z.string().min(1),
      values: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data }) => {
    const { createSubmission } = await import('#/server/submissions')
    return createSubmission({
      orgSlug: data.orgSlug,
      formSlug: data.formSlug,
      values: data.values as Record<string, unknown>,
    })
  })
