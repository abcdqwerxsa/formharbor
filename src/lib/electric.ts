// ElectricSQL integration — platform-level.
// See docs/integrations/electric.md for the full setup path.
//
// This file is intentionally a THIN PLACEHOLDER. Real local-first sync is not
// hand-rolled here: it requires running the Electric service against Postgres
// and defining Shapes. That plumbing + external service are out of scope until
// provisioned (see the doc).

/**
 * Placeholder type for a synced row. Replace `Row` with your real row shape
 * (e.g. a Prisma model) when you adopt Electric.
 */
export type ElectricRow<T = Record<string, unknown>> = {
  row: T
  operation?: 'insert' | 'update' | 'delete'
}

/**
 * Whether Electric sync is available. Returns `false` until the Electric
 * service is running and configured, so callers can degrade gracefully.
 *
 * TODO(platform): once the Electric service is provisioned and
 * `@electric-sql/client` is installed, switch this to read the configured
 * service URL, e.g. `Boolean(process.env.ELECTRIC_SERVICE_URL)`.
 */
export function isElectricConfigured(): boolean {
  return false
}

// TODO: when enabled, expose typed shape hooks here, e.g.:
//   import { useShape } from '@electric-sql/client'
//   export function useTodos() {
//     return useShape<Todo>({
//       url: `${import.meta.env.VITE_ELECTRIC_SERVICE_URL}/v1/shape`,
//       table: 'todos',
//     })
//   }
export {}
