import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Unkey } from '@unkey/api'

/**
 * Unkey — SERVER-SIDE ONLY.
 *
 * Chosen path: API key VERIFICATION via @unkey/api (not rate limiting with
 * @unkey/ratelimit). The product need is unclear in a blank starter, so this is
 * a minimal, real wrapper + a TODO showing where to gate a protected endpoint.
 *
 * Security:
 * - UNKEY_API_KEY is a ROOT key — secret, server-only, never sent to the client.
 *   It is read INSIDE the handler (per-request), never at module scope.
 * - UNKEY_API_ID identifies which Unkey API the key belongs to.
 * - The raw Unkey SDK result is normalized into an app-owned type.
 */

/** App-owned verification result. */
export type UnkeyVerifyResult = {
  configured: boolean
  valid: boolean
  /** Unkey reason/code when invalid or misconfigured (never the root key). */
  detail?: string
}

export const verifyApiKey = createServerFn({ method: 'POST' })
  .validator(z.object({ key: z.string().min(1) }))
  .handler(async ({ data }): Promise<UnkeyVerifyResult> => {
    const token = process.env.UNKEY_API_KEY
    const apiId = process.env.UNKEY_API_ID
    if (!token || !apiId) {
      return {
        configured: false,
        valid: false,
        detail: 'UNKEY_API_KEY or UNKEY_API_ID is not set. Add them to .env.local.',
      }
    }

    const unkey = new Unkey({ token })
    const res = await unkey.keys.verify({ apiId, key: data.key })

    // @unkey/api v2 returns a Result: `{ val } | { err }`.
    if (res.err) {
      return { configured: true, valid: false, detail: res.err.message }
    }

    const value = res.val
    return {
      configured: true,
      valid: value.valid === true,
      detail: value.valid ? 'Valid' : value.code ?? 'Invalid',
    }
  })

// TODO(example): gate a protected endpoint by calling verifyApiKey first, e.g.
//   const check = await verifyApiKey({ data: { key: getRequestHeader('x-api-key') } })
//   if (!check.valid) { setResponseStatus(401); return null }
// ...then proceed with the protected work.
