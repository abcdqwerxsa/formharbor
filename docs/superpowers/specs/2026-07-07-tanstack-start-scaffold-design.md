# Design — TanStack Start app + partner integrations (Nix-managed, bun)

Date: 2026-07-07
Status: Approved

## Goal
Scaffold a blank TanStack Start app and represent each requested partner integration
(Cloudflare, AG Grid, SerpAPI, WorkOS, Electric, Sentry, Prisma, Neon, Unkey). Manage the
dev environment with Nix. Use bun for packages and eslint as the toolchain.

## Contradictions resolved (with the user)
- **Package manager:** prompt said both "Use bun" and `--package-manager pnpm`. → **bun**, provided by a Nix flake devShell (bun is not installed system-wide).
- **Scope:** headline "blank, no integrations" vs. detailed body (AG Grid demo, SerpAPI, Electric, Unkey, add-ons). → **blank starter *type*** + every integration the body describes.
- **Toolchain:** "use eslint" vs. "keep default CLI toolchain". → `--toolchain eslint` is a first-class CLI option, so both hold.
- **SerpAPI engine:** "choose one". → `google`.
- **Unkey path:** product need unclear. → minimal server-side API-key-verification wrapper via `@unkey/api` + TODO.

## Stack
- TanStack Start (React, file-router, SSR), TypeScript, Tailwind (always on).
- Deployment: Cloudflare (`--deployment cloudflare`).
- CLI add-ons: `workos, sentry, prisma, neon`.
- Package manager: bun. Toolchain: eslint.
- Dev env: Nix flake devShell.

## Scaffold + merge flow
1. Ad-hoc Nix shell (bun + node) runs the CLI into a scratch dir:
   `npx @tanstack/cli@latest create tanstack-app --agent --package-manager bun --toolchain eslint --tailwind --deployment cloudflare --add-ons workos,sentry,prisma,neon --no-install`
   - Deltas from the pasted command: `pnpm → bun`, add `--toolchain eslint`, add `--no-install`.
2. Merge scratch → `/home/nilpo/tanstack-app` (incl. dotfiles); delete scratch.
3. Add `flake.nix` (devShell: bun, nodejs_24, git), `.envrc` (optional direnv), `.env.example`.
4. `nix develop -c bun install`.
5. `npx @tanstack/intent@latest install` + `list`; read shipped guidance; adapt patterns.

## Integrations
- **AG Grid (Community):** `ag-grid-react` + `ag-grid-community` only (no enterprise, no key). Route `src/routes/grid.tsx`: explicit `columnDefs`, typed `rowData`, explicit container height, `ag-theme-quartz`, sorting/filtering. Linked from index.
- **SerpAPI:** `serpapi` (official). Server fn `src/server/serpapi.ts` (`createServerFn`): engine `google`, reads `process.env.SERPAPI_API_KEY` server-side only, normalizes organic results → `SerpResult[] {title,link,snippet,position}`. Route `src/routes/serpapi.tsx`. Graceful "not configured" when key missing. Caveat: pkg uses Node http → needs `nodejs_compat` on Workers; works in local dev.
- **Electric:** platform-level only. Thin typed stub `src/lib/electric.ts` + `docs/integrations/electric.md` pointing to the official Electric starter (service + Postgres shapes). No `@electric-sql` plumbing.
- **Unkey:** `@unkey/api`. `src/server/unkey.ts` minimal `verifyApiKey()` wrapper, `UNKEY_API_KEY` server-side only, example + TODO. Root keys never client-side.
- **workos / sentry / prisma / neon:** preserved as generated; fill `.env.example`; document env vars + Neon/Prisma-on-Workers adapter notes.

## Env vars (`.env.example`)
`SERPAPI_API_KEY`, `UNKEY_API_KEY`, `DATABASE_URL`, `DIRECT_URL`, WorkOS `WORKOS_*` (exact names from add-on), Sentry DSN/auth, optional `AG_GRID_ENTERPRISE_KEY` (documented, unused). All marked server/secret.

## Durable context
`AGENTS.md`: exact CLI command, Intent commands, stack, each integration + env vars, deploy notes, gotchas, next steps.

## Verification
`nix develop -c bun install` → `bun run lint` → `bun run build` → `bun run dev`; open `/` and `/grid` in a browser (chrome-devtools) and screenshot. Report real output.

## Known gotchas / open items
- SerpAPI `node:http` on Cloudflare Workers → `nodejs_compat` flag + documented fetch fallback.
- Prisma on Workers needs the Neon HTTP adapter (`@prisma/adapter-neon`); verify add-on wiring.
- Electric requires running the Electric service + a Postgres → out of scope to hand-roll; notes only.
- Unkey/SerpAPI/WorkOS/Sentry all need live keys from external dashboards → `.env.example` + TODOs.
