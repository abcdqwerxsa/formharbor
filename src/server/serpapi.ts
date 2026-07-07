import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getJson } from 'serpapi'

/**
 * SerpAPI — SERVER-SIDE ONLY.
 *
 * - The SERPAPI_API_KEY is read INSIDE the handler (per-request), never at
 *   module scope. On Cloudflare Workers env is injected per request, so
 *   module-scope reads would be undefined; it would also leak to the client.
 * - One explicit engine is used: `google` (not "every engine").
 * - The raw SerpApi response is normalized into app-owned types before it
 *   leaves this function, so the UI never depends on SerpApi's shape.
 *
 * Transport note: the `serpapi` package uses Node's `http`/`https`. Local dev
 * (Node) works out of the box. On Cloudflare Workers it relies on the
 * `nodejs_compat` flag (already set in wrangler.jsonc). If it ever fails on
 * Workers, fall back to a direct `fetch` to https://serpapi.com/search with the
 * same SERPAPI_API_KEY + normalization.
 */

/** App-owned normalized search result. */
export type SerpResult = {
  position: number
  title: string
  link: string
  snippet: string
}

/** Discriminated response so the UI can tell "not configured" from "empty". */
export type SerpSearchResponse =
  | { configured: false; error: string }
  | { configured: true; results: SerpResult[] }

// Minimal slice of SerpApi's Google organic result — only what we normalize.
type SerpApiOrganicResult = {
  position?: number
  title?: string
  link?: string
  snippet?: string
}
type SerpApiGoogleResponse = { organic_results?: SerpApiOrganicResult[] }

export const searchGoogle = createServerFn({ method: 'POST' })
  .validator(z.object({ query: z.string().min(1) }))
  .handler(async ({ data }): Promise<SerpSearchResponse> => {
    const apiKey = process.env.SERPAPI_API_KEY
    if (!apiKey) {
      return {
        configured: false,
        error: 'SERPAPI_API_KEY is not set. Add it to .env.local to enable search.',
      }
    }

    const raw = (await getJson({
      engine: 'google', // one explicit engine
      q: data.query,
      api_key: apiKey,
      num: 10,
    })) as SerpApiGoogleResponse

    const organic = raw.organic_results ?? []
    const results: SerpResult[] = organic.map((r, i) => ({
      position: r.position ?? i + 1,
      title: r.title ?? '',
      link: r.link ?? '',
      snippet: r.snippet ?? '',
    }))

    return { configured: true, results }
  })
