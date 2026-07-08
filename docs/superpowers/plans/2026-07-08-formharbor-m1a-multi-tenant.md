# FormHarbor M1a — Multi-tenant Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Add `Organization` + `Membership`; every signed-in user gets a default org (OWNER); `/app` shows the user's org context and a (placeholder) form list.

**Architecture:** Prisma adds Organization/Membership (CockroachDB). A server-only `org` service (`ensureOrgForUser` / `listOrgsForUser`) reuses M0's `getPrisma()`. A `requireOrgMember` middleware injects `currentOrg`. `/app` renders org picker/creator + empty form list.

**Tech Stack:** TanStack Start, Prisma (CockroachDB, `runtime=workerd`), zod, vitest.

## Global Constraints

- Run inside Nix: `nix --extra-experimental-features 'nix-command flakes' develop -c bash -c '...'`
- **DB/vitest commands must `unset ALL_PROXY all_proxy HTTP_PROXY http_PROXY HTTPS_PROXY https_proxy NO_PROXY no_proxy` first**, and load DB via `bunx dotenv -e .env.local --`. CockroachDB remote/slow; retry on P1001; `fileParallelism:false` + `testTimeout:30000` already set.
- Prisma client already `runtime=workerd`. After schema edit: `bun run db:generate` then `bun run db:push --accept-data-loss`.
- DB access via `getPrisma()` from `#/db` (async; Hyperdrive in Workers, DATABASE_URL in vitest). `#/db` is server-only — new server files import it inside functions, not at module top-level if the file is client-reachable.
- Commit per task. Branch `feat/m1a-multi-tenant`. Git identity set.

---

### Task 1: Prisma `Organization` + `Membership` models

**Files:** Modify `prisma/schema.prisma`; regenerate `src/generated/prisma`.

- [ ] Append to `prisma/schema.prisma`:
```prisma
model Organization {
  id        String  @id @default(cuid())
  name      String
  slug      String @unique
  createdAt DateTime @default(now())
  memberships Membership[]
}

model Membership {
  id     String @id @default(cuid())
  userId String
  orgId  String
  role   Role   @default(OWNER)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  org    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([userId, orgId])
}

enum Role { OWNER ADMIN MEMBER }
```
- [ ] Run `bun run db:generate && bun run db:push --accept-data-loss` (proxy unset). Verify `prisma.organization.count()` and `prisma.membership.count()` return 0.
- [ ] Commit `feat(m1a): Organization + Membership models`.

---

### Task 2: Org service (`ensureOrgForUser`, `listOrgsForUser`)

**Files:** Create `src/server/org.ts` + `src/server/org.test.ts`.
**Produces:** `ensureOrgForUser(userId, email): Promise<{id,name,slug,role}>` (creates a default org + OWNER membership if the user has none; else returns first), `listOrgsForUser(userId): Promise<Array<{id,name,slug,role}>>`.

- [ ] Test `org.test.ts` (integration, 30s timeout, dotenv DB): (a) new user → org created, role OWNER, slug unique; (b) same user twice → idempotent (no second org); (c) listOrgsForUser returns the org. afterEach cleans org/membership/user.
- [ ] Implement `src/server/org.ts` (server-only; `import { getPrisma } from '#/db'` inside functions). Slug from email local-part + random suffix (e.g. `jeanpaul-1d2e3`), ensure unique.
- [ ] Run tests pass. Lint clean. Commit `feat(m1a): org service`.

---

### Task 3: `requireOrgMember` middleware + `getCurrentOrg`

**Files:** Create `src/server/auth/org-middleware.ts` + test.
**Produces:** `orgMiddleware` (createMiddleware `{type:'function'}`).server → reads `authMiddleware` context (user) → if user, `ensureOrgForUser` → injects `context.currentOrg`; `getCurrentOrg` server fn returns currentOrg (or null if no user). Also a route-param `requireOrgMember(orgId)` helper that checks Membership + returns 404/403 on mismatch (used later by Form CRUD — implement but no caller yet).

- [ ] Compose: `orgMiddleware = authMiddleware.server(async ({ next, context }) => { const org = context.user ? await ensureOrgForUser(context.user.id, context.user.email) : null; return next({ context: { currentOrg: org } }) })`. (Compose with authMiddleware so `context.user` is populated.)
- [ ] Test: stub `ensureOrgForUser`, assert middleware injects currentOrg when user present, null when not.
- [ ] Commit `feat(m1a): org middleware`.

---

### Task 4: `/app` org view + wire into `_authenticated`

**Files:** Modify `src/routes/_authenticated/app.tsx`; (optional) `src/routes/_authenticated/app.tsx` calls `getCurrentOrg`.
- [ ] `app.tsx`: call `getCurrentOrg()` (via loader or server fn), render org name + role + "Forms (none yet — M1b)". Keep "Sign out".
- [ ] `_authenticated.tsx` beforeLoad: keep getCurrentUser (auth); the org is fetched in `/app` itself (don't block all guarded routes on org). Verify `/app` shows org name for the signed-in user; `/login`→`/app` flow still works.
- [ ] Manual: `bun run dev` (proxy unset), register/login, `/app` shows "<orgname> · OWNER". Commit `feat(m1a): /app org view`.

---

## Self-Review

- Spec coverage: Organization/Membership (T1), default-org-on-first-visit (T2), org context in `/app` (T3-T4). Form CRUD = M1b (out of scope here). ✓
- No placeholders; types match (`currentOrg`, `ensureOrgForUser`, `listOrgsForUser`, `orgMiddleware`, `getCurrentOrg`). ✓
