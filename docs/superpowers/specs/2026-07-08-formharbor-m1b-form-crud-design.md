# FormHarbor — M1b Design: Form CRUD (builder-only)

**Date:** 2026-07-08
**Status:** Approved (design)
**Milestone:** M1b
**Parent spec:** `docs/superpowers/specs/2026-07-07-formharbor-stage1-design.md`

## Context

M1a (multi-tenant foundation) is complete and shipped: `Organization` / `Membership`
/ `Role`, `orgMiddleware` + `getCurrentOrg`, and the `/app` org view. Build, 26
tests, lint, and deploy are green (PR #2).

Per the stage-1 milestones, **M1 = "Multi-tenant foundation + Form CRUD (no
logic, no files)"**. This doc scopes the **M1b** slice of M1: the form **builder**
— create / list / edit / delete forms with a basic fields model. Public fill,
Submission collection, and AG Grid browse are **M2**; file upload is **M3**;
multi-page + conditional logic engine is **M4**; permission polish is **M5**.

> Note: the stage-1 spec still references WorkOS (`workosOrgId` / `workosUserId`),
> which M0 dropped. This design follows the **actual** M1a schema (no WorkOS).

## Goals & scope

### In scope (M1b)
- `Form` Prisma model + `FormStatus` enum, scoped per org.
- A shared, dependency-free form schema module (TS contracts + zod) usable by
  both server and client.
- A server-only form service (`createForm`, `listForms`, `getForm`,
  `updateForm`, `deleteForm`) with org-scoped ownership checks.
- Server fns (create/list/get/update/delete) gated by the M1a `orgMiddleware`.
- A structured field-editor builder UI under `/app/forms`.
- Integration tests (CockroachDB) + zod unit tests.

### Out of scope (explicitly deferred)
- `Submission` / `FileAsset` models, the public `/f/:slug` fill route, and
  submission browse → **M2 / M3**.
- `pages` / `logic` Json columns, `pageId` on fields, multi-page, conditional
  logic → **M4**. (M1b forms are single-page by definition; `logic` does not
  exist yet.)
- File field type (`'file'`) → **M3**.
- Role-based restrictions (only OWNER/ADMIN may delete, etc.) → **M5**. M1b
  allows any org member to CRUD forms in their current org.
- Org-scoped URL params (`/o/$orgId/...`) and org switching → **M5**. M1b uses
  the current (default) org from `orgMiddleware`, consistent with `/app`.

### Non-goals / YAGNI notes
- `requireOrgMember(orgId)` (built in M1a for org-param routes) **stays without a
  caller** in M1b — current-org routing doesn't need it. It remains for future
  org-scoped routes.
- The `settings` Json column is added now (default `{}`) so M2 can populate it
  (confirmation message, etc.) without a migration, but M1b builds **no
  settings UI** — `settings` stays `{}`.

## Data model (Prisma)

Add to `prisma/schema.prisma`:

```prisma
model Form {
  id        String      @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name      String
  slug      String                        // unique per org
  status    FormStatus   @default(DRAFT)
  fields    Json                          // Field[] — each field has a stable id
  settings  Json                          // FormSettings — {} in M1b
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  @@unique([orgId, slug])
  @@index([orgId])                        // listForms query
}

enum FormStatus { DRAFT OPEN CLOSED }
```

`Organization` gains `forms Form[]`. (`Submission[]` / the `Submission` model
are M2 — do **not** add them now; the `submissions` relation is added then.)

**Migration:** `bun run db:generate && bun run db:push --accept-data-loss` (proxy
unset). `--accept-data-loss` is required by Prisma for CockroachDB on additive
changes; no existing data is at risk (additive only).

## Shared schema — `src/forms/schema.ts`

Pure module — **no server-only imports** (no `#/db`, no `cloudflare:workers`) so
it is safe for the client builder to import. Exports TS types and matching zod
schemas.

```ts
import { z } from 'zod'

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'email' | 'date'
  | 'select' | 'radio' | 'checkbox'            // 'file' deferred to M3

export interface Field {
  id: string                 // f_<crypto.randomUUID()>; stable, stored in Json
  type: FieldType
  label: string
  help?: string
  required: boolean
  placeholder?: string
  options?: string[]         // required for select/radio/checkbox; ignored otherwise
}

export interface FormSettings { /* M1b: {} — M2 adds confirmationMessage etc. */ }

export type FormStatus = 'DRAFT' | 'OPEN' | 'CLOSED'

export const fieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['text','textarea','number','email','date','select','radio','checkbox']),
  label: z.string().min(1).max(200),
  help: z.string().max(500).optional(),
  required: z.boolean(),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string().min(1)).optional(),
})

export const formSettingsSchema = z.object({}).strict()   // M1b: empty; M2 extends

export const createFormInput = z.object({ name: z.string().min(1).max(100) })

export const updateFormInput = z.object({
  formId: z.string().min(1),
  name: z.string().min(1).max(100),
  fields: z.array(fieldSchema),
  status: z.enum(['DRAFT','OPEN','CLOSED']),
  settings: formSettingsSchema,
})

export type CreateFormInput = z.infer<typeof createFormInput>
export type UpdateFormInput = z.infer<typeof updateFormInput>
```

**Field-id generation:** the builder generates `f_${crypto.randomUUID()}` when a
field is added (client-side). `crypto.randomUUID()` is available in browsers and
in the workerd runtime. Stable ids let M4 logic rules reference fields without a
migration.

## Service — `src/server/forms.ts`

Server-only (`import '@tanstack/react-start/server-only'`); lazily imports
`#/db` inside each function (same discipline as `org.ts`). All functions take an
explicit `orgId` (the caller — a server fn — supplies `context.currentOrg.id`).

```ts
createForm(orgId, input: { name: string }): Promise<Form>
  // slug from name (lowercase, [a-z0-9-], unique per org via suffix retry);
  // fields: [], status: DRAFT, settings: {}

listForms(orgId): Promise<Array<{ id, name, slug, status, updatedAt }>>
  // light select — no fields/settings

getForm(orgId, formId): Promise<Form | null>
  // load by id; return null if not found OR form.orgId !== orgId (no existence leak)

updateForm(orgId, formId, input: UpdateFormInput): Promise<Form>
  // load, verify orgId match (else throw 404), zod-validated input,
  // recompute slug only if name changed (suffix retry on collision)

deleteForm(orgId, formId): Promise<void>
  // load, verify orgId match (else throw 404), delete
```

**Slug helper** (`buildSlugFromName(name)`): lowercase → replace `[^a-z0-9]+`
with `-` → trim leading/trailing `-` → slice(0,40) → fallback `form`; append a
short random suffix on per-org collision (reuse the pattern from
`buildSlugFromEmail` in `org.ts`).

## Server functions — `src/server/forms/functions.ts`

Each uses `orgMiddleware` (which sets `context.currentOrg` via
`ensureOrgForUser`) and reads `context.currentOrg.id`. Client-imported module —
so **no top-level server-only imports**; the service is imported lazily inside
handlers (same discipline as `functions.ts` / `org-middleware.ts`).

```ts
listOrgForms   = createServerFn({ method: 'GET'  }).middleware([orgMiddleware])
                  .handler(async ({ context }) => listForms(context.currentOrg!.id))

getOrgForm     = createServerFn({ method: 'GET'  }).validator(z.object({ formId: z.string() }))
                  .middleware([orgMiddleware])
                  .handler(async ({ data, context }) => getForm(context.currentOrg!.id, data.formId))

createOrgForm  = createServerFn({ method: 'POST' }).validator(createFormInput)
                  .middleware([orgMiddleware])
                  .handler(async ({ data, context }) => createForm(context.currentOrg!.id, data))

updateOrgForm  = createServerFn({ method: 'POST' }).validator(updateFormInput)
                  .middleware([orgMiddleware])
                  .handler(async ({ data, context }) => updateForm(context.currentOrg!.id, data.formId, data))

deleteOrgForm  = createServerFn({ method: 'POST' }).validator(z.object({ formId: z.string() }))
                  .middleware([orgMiddleware])
                  .handler(async ({ data, context }) => deleteForm(context.currentOrg!.id, data.formId))
```

`context.currentOrg` is non-null here because `orgMiddleware` only returns null
when there's no user — and `orgMiddleware` is composed on `authMiddleware`, so an
unauthenticated request is redirected by the `_authenticated` layout before
these run. (If `currentOrg` is ever null at runtime, throw a clear error rather
than silently no-op.)

## Routes & builder UI

Routes live under `src/routes/_authenticated/app/forms/` (the `_authenticated`
layout already enforces login + redirect). `orgMiddleware` is applied per
server fn, not at the route level, so non-form `/app` routes stay unaffected.

- **`GET /app/forms`** (`app/forms/index.tsx`) — table of the current org's
  forms (name, status, updatedAt, "Edit" link). "New form" button → `/app/forms/new`.
  Calls `listOrgForms()`.
- **`GET /app/forms/new`** (`app/forms/new.tsx`) — a single "name" input; on
  submit calls `createOrgForm({ name })`, redirects to
  `/app/forms/$formId/edit`.
- **`GET /app/forms/$formId/edit`** (`app/forms/$formId/edit.tsx`) — the
  structured field editor (see below). Loads the form via a `loader` that calls
  `getOrgForm({ formId })`; if null, `notFound()`.

**Structured field editor** (confirmed approach):
- Form name (text), slug (read-only display), status (`<select>`:
  DRAFT/OPEN/CLOSED).
- Fields list: each field rendered as a card/row with inputs for type (`<select>`
  of FieldTypes), label, help, required (checkbox), placeholder, and options
  (comma-separated input, shown only for select/radio/checkbox). Add-field
  button (generates `f_<uuid>`), remove, up/down reorder.
- **Save** → `updateOrgForm({ formId, name, fields, status, settings: {} })`;
  show success/error. **Delete** → confirm → `deleteOrgForm({ formId })` →
  redirect to `/app/forms`.

`Field[]` state is held in `useState` (seeded from the loader data); the server
fn is the source of truth on save. No live preview, no drag-drop, no logic
(M4).

**`/app` update** (`app.tsx`): replace the M1a "Forms (none yet — M1b)" line
with a "Forms →" link to `/app/forms`.

## Permissions & error handling

- **Permissions:** any org member can CRUD forms in their current org. Gate =
  `orgMiddleware` (membership) + the service's `form.orgId === orgId` ownership
  check. M5 adds role-based restrictions.
- **Not a member / form not in org:** service returns `null` (get) or throws a
  404-shaped error (update/delete) — never reveals that the form exists.
- **Invalid input:** zod validation in the server fn throws before the service
  is reached; the client surfaces the message.
- **Slug collision:** auto-suffix (retry up to 5×); the `@@unique([orgId, slug])`
  constraint is the backstop.

## Testing

### `src/forms/schema.test.ts` (pure unit, no DB)
- `fieldSchema` accepts a valid field; rejects unknown `type`, missing `label`,
  wrong `options` shape.
- `updateFormInput` accepts a full valid payload; rejects bad `status`,
  non-array `fields`.

### `src/server/forms.test.ts` (CockroachDB integration; 30s timeout; dotenv env)
Setup: create a user + their default org (reuse `ensureOrgForUser`) → that org's
`id` is the test org. Also create a second user+org for the ownership case.
- `createForm`: returns a form with `fields=[]`, `status=DRAFT`, a slug derived
  from the name; `listForms` includes it.
- Slug uniqueness: two forms with the same name get distinct slugs (suffix).
- `getForm`: returns the form; returns `null` for a form in **org B** when
  queried with org A's id (ownership / no-leak).
- `updateForm`: updates name/fields/status; zod rejects a malformed `fields`
  array; recompute slug when name changes.
- `deleteForm`: removes the form; `getForm` returns `null` afterward;
  `deleteForm` on org B's form (with org A's id) throws 404 and does not delete.
- `afterEach`: clean `form` → `membership` → `org` → `user` for both test users.
  File parallelism stays disabled (existing `vitest.config.ts`).

## Verification (acceptance)

- `bun run db:generate && bun run db:push --accept-data-loss` succeeds; `prisma.form`
  is queryable.
- `dotenv -e .env.local -- vitest run` — all green (existing 26 + new form tests).
- `bun run lint` clean.
- `bun run build` clean (no `pg`/Prisma leak into the client — the lazy-import
  discipline in `functions.ts` prevents it).
- `bun run deploy`; register/login, `/app` → "Forms" → create a form → add
  fields → save → see it in the list → delete.

## Open questions

None blocking. (Submission model/columns, public route, file fields, logic, and
role-based perms are explicitly deferred to M2–M5.)
