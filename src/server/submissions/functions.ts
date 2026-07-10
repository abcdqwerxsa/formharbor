import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { orgMiddleware } from '#/server/auth/org-middleware'

// Admin browse — gated by orgMiddleware (current org). Service imported lazily
// via the `#/server/submissions` alias (see public.ts for the reason).

export const listOrgFormSubmissions = createServerFn({ method: 'GET' })
  .validator(z.object({ formId: z.string().min(1) }))
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    if (!context.currentOrg) throw new Error('No current org context')
    const { listSubmissions } = await import('#/server/submissions')
    return listSubmissions(context.currentOrg.id, data.formId)
  })
