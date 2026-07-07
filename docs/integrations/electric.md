# Electric (ElectricSQL)

Electric is treated as a **platform-level integration**, not a drop-in add-on.

## Status: not wired up (by design)

This project intentionally does **not** install `@electric-sql/client` or
hand-roll sync plumbing. A thin typed placeholder lives in
`src/lib/electric.ts`. Electric only becomes useful once its service is running
and pointed at a Postgres database.

## What Electric would do

Electric syncs subsets of your Postgres database ("Shapes") to clients in real
time, enabling local-first / offline-first apps. This project already has a
Postgres database (Neon) reachable two ways:

- `src/db.ts` — raw Neon serverless SQL (`@neondatabase/serverless`)
- Prisma — `prisma/schema.prisma` + `@prisma/client` (adapter-pg)

Electric would stream changes from that same Postgres to the browser.

## Official path to enable it

1. **Run the Electric service** — https://electric-sql.com/docs/quickstart
   (self-host via Docker, or use Electric Cloud).
2. **Point it at your Neon database** using the same `DATABASE_URL`.
3. **Install the client (only when ready):**
   ```sh
   bun add @electric-sql/client
   ```
4. **Define Shapes** in `src/lib/electric.ts`, e.g.:
   ```ts
   import { useShape } from '@electric-sql/client'
   export function useTodos() {
     return useShape({
       url: `${import.meta.env.VITE_ELECTRIC_SERVICE_URL}/v1/shape`,
       table: 'todos',
     })
   }
   ```
5. **Configure the env var** (client-visible service URL):
   - `VITE_ELECTRIC_SERVICE_URL`

## Why it is stubbed

The task spec says: treat Electric as platform-level, do not hand-roll full sync
plumbing, prefer clear setup notes/TODOs, and make missing local tooling /
service setup explicit. Real adoption depends on the Electric service and
provisioning that cannot be done from code alone.
