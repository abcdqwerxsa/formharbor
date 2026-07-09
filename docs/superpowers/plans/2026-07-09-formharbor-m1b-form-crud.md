# FormHarbor M1b — Form CRUD (builder-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add form builder CRUD (create/list/edit/delete forms with a basic fields model) scoped per org, gated by the M1a org middleware.

**Architecture:** New `Form` Prisma model (fields/settings as Json; logic/pages/submissions deferred). A dependency-free `src/forms/schema.ts` (TS types + zod) shared by server and client. A server-only `src/server/forms.ts` service with org-scoped ownership checks. Thin server fns in `src/server/forms/functions.ts` gated by `orgMiddleware` (current org — no orgId URL param). A structured field-editor UI under `/app/forms`.

**Tech Stack:** TanStack Start (react-start) + Prisma 7 (`runtime=workerd`, CockroachDB) + zod + Cloudflare Workers (@cloudflare/vite-plugin) + vitest. Runs in a Nix shell with `bun`.

## Global Constraints

- **Shell:** All `bun`/`vitest`/`prisma` commands run inside the Nix shell:
  `nix --extra-experimental-features 'nix-command flakes' develop -c bash -c '<cmd>'`
- **DB-integration tests** need the env loaded: prefix the command with
  `dotenv -e .env.local --` (so the full vitest invocation is
  `nix ... develop -c bash -c 'dotenv -e .env.local -- vitest run <path>'`).
  `vitest.config.ts` has `fileParallelism: false` and `testTimeout: 30_000` already.
- **Server-only discipline (critical — this is what broke M1a's build):** any module
  imported by client code (route components, server-fn modules) must import `#/db`
  and other server-only modules **lazily inside `.server()`/handler bodies**, never at
  module top level. A top-level value import leaks `pg`/Prisma into the client bundle
  and fails `vite build` with `UNLOADABLE_DEPENDENCY` on the wasm `?module`.
- **Prisma:** `runtime = "workerd"`, `provider = "cockroachdb"`. After schema changes:
  `bun run db:generate && bun run db:push --accept-data-loss` (proxy unset). The
  generated client is at `src/generated/prisma` and is eslint-ignored.
- **Build:** `@cloudflare/vite-plugin` handles Prisma's `*.wasm?module` natively — do
  NOT add any `wasmModulePlugin` to `vite.config.ts` (that was the M1a mistake).
- **Deploy:** `bun run deploy` with proxy env unset
  (`unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy`); retry on "fetch failed".
- **Branch:** `feat/m1b-form-crud` (already created, branched from `feat/m1a-multi-tenant`).

## File Structure

- **Modify** `prisma/schema.prisma` — add `Form` model + `FormStatus` enum; add `forms Form[]` to `Organization`.
- **Create** `src/forms/schema.ts` — TS contracts + zod schemas (NO server-only imports → client-safe).
- **Create** `src/forms/schema.test.ts` — zod unit tests (no DB).
- **Create** `src/server/forms.ts` — server-only service: `createForm`, `listForms`, `getForm`, `updateForm`, `deleteForm`, `buildSlugFromName`.
- **Create** `src/server/forms.test.ts` — CockroachDB integration tests.
- **Create** `src/server/forms/functions.ts` — server fns (`listOrgForms`, `getOrgForm`, `createOrgForm`, `updateOrgForm`, `deleteOrgForm`) gated by `orgMiddleware`.
- **Modify** `src/routes/_authenticated/app.tsx` — replace "Forms (none yet — M1b)" with a link to `/app/forms`.
- **Create** `src/routes/_authenticated/app/forms/index.tsx` — list view.
- **Create** `src/routes/_authenticated/app/forms/new.tsx` — create-form view.
- **Create** `src/routes/_authenticated/app/forms/$formId/edit.tsx` — structured field editor.

---

### Task 1: Prisma `Form` model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add `Form` model + `FormStatus` enum; add `forms Form[]` to `Organization`)

**Interfaces:**
- Produces: `prisma.form` model (columns: `id, orgId, name, slug, status, fields, settings, createdAt, updatedAt`; `@@unique([orgId, slug])`, `@@index([orgId])`), `enum FormStatus { DRAFT OPEN CLOSED }`, and `Organization.forms`.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add `forms Form[]` to the `Organization` model (after the `memberships Membership[]` line):

```prisma
model Organization {
  id          String       @id @default(cuid())
  name        String
  slug        String       @unique
  createdAt   DateTime     @default(now())
  memberships Membership[]
  forms       Form[]
}
```

Append the `Form` model and `FormStatus` enum at the end of the file (after the `Role` enum):

```prisma
model Form {
  id        String      @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name      String
  slug      String
  status    FormStatus   @default(DRAFT)
  fields    Json
  settings  Json
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  @@unique([orgId, slug])
  @@index([orgId])
}

enum FormStatus {
  DRAFT
  OPEN
  CLOSED
}
```

- [ ] **Step 2: Regenerate the client + push the schema**

Run (proxy unset — Prisma may fetch; the registry is npmmirror):
```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy; bun run db:generate && bun run db:push --accept-data-loss'
```
Expected: client regenerated (`src/generated/prisma/models/Form.ts` appears), schema pushed to CockroachDB without error.

- [ ] **Step 3: Verify the model is queryable**

Run:
```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'dotenv -e .env.local -- node -e "import(\"#/db\").then(async m=>{const p=await m.getPrisma(); console.log(await p.form.count())}).catch(e=>{console.error(e);process.exit(1)})"'
```
(If the `#/` alias isn't resolved by bare `node`, instead add a one-off `vitest` check: create a temporary `src/server/forms.smoke.test.ts` with `it(\"counts\", async () => { const { getPrisma } = await import(\"#/db\"); const p = await getPrisma(); expect(typeof await p.form.count()).toBe(\"number\") })`, run it with the dotenv prefix, then delete it.) Expected: `0` (or a number), no error.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma src/generated/prisma
git commit -m "feat(m1b): Form + FormStatus model (builder-only, no submissions/pages/logic)"
```

---

### Task 2: Shared form schema (`src/forms/schema.ts`) + zod tests (TDD)

**Files:**
- Create: `src/forms/schema.ts`
- Test: `src/forms/schema.test.ts`

**Interfaces:**
- Produces: types `FieldType`, `Field`, `FormSettings`, `FormStatus`; const `FIELD_TYPES`; zod schemas `fieldSchema`, `formSettingsSchema`, `createFormInput`, `updateFormInput`; types `CreateFormInput`, `UpdateFormInput`. Consumed by Task 3 (service) and Tasks 5–6 (UI).

- [ ] **Step 1: Write the failing test `src/forms/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  fieldSchema,
  updateFormInput,
  createFormInput,
  FIELD_TYPES,
} from './schema'

describe('fieldSchema', () => {
  it('accepts a valid field', () => {
    expect(
      fieldSchema.parse({
        id: 'f_1',
        type: 'text',
        label: 'Name',
        required: true,
      }),
    ).toMatchObject({ id: 'f_1', type: 'text', label: 'Name', required: true })
  })

  it('accepts a select field with options', () => {
    expect(
      fieldSchema.parse({
        id: 'f_2',
        type: 'select',
        label: 'Color',
        required: false,
        options: ['red', 'green'],
      }).options,
    ).toEqual(['red', 'green'])
  })

  it('rejects an unknown field type', () => {
    expect(() =>
      fieldSchema.parse({ id: 'f_3', type: 'file', label: 'X', required: false }),
    ).toThrow()
  })

  it('rejects an empty label', () => {
    expect(() =>
      fieldSchema.parse({ id: 'f_4', type: 'text', label: '', required: false }),
    ).toThrow()
  })
})

describe('createFormInput', () => {
  it('accepts a non-empty name', () => {
    expect(createFormInput.parse({ name: 'Contact Us' }).name).toBe('Contact Us')
  })
  it('rejects an empty name', () => {
    expect(() => createFormInput.parse({ name: '' })).toThrow()
  })
})

describe('updateFormInput', () => {
  const valid = {
    formId: 'abc',
    name: 'My Form',
    fields: [{ id: 'f_1', type: 'email', label: 'Email', required: true }],
    status: 'OPEN',
    settings: {},
  }
  it('accepts a full valid payload', () => {
    expect(updateFormInput.parse(valid).status).toBe('OPEN')
  })
  it('rejects an invalid status', () => {
    expect(() => updateFormInput.parse({ ...valid, status: 'PUBLISHED' })).toThrow()
  })
  it('rejects a malformed fields array', () => {
    expect(() =>
      updateFormInput.parse({ ...valid, fields: [{ id: 'x', type: 'nope', label: 'Y', required: false }] }),
    ).toThrow()
  })
  it('rejects unknown settings keys (strict)', () => {
    expect(() =>
      updateFormInput.parse({ ...valid, settings: { surprise: 1 } }),
    ).toThrow()
  })
})

describe('FIELD_TYPES', () => {
  it('excludes the file type (deferred to M3)', () => {
    expect(FIELD_TYPES).not.toContain('file')
    expect(FIELD_TYPES).toContain('text')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'bunx vitest run src/forms/schema.test.ts'
```
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Implement `src/forms/schema.ts`**

```ts
import { z } from 'zod'

// Pure module — NO server-only imports (no `#/db`, no `cloudflare:workers`).
// Safe for the client builder to import.

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'email',
  'date',
  'select',
  'radio',
  'checkbox',
] as const // 'file' deferred to M3

export type FieldType = (typeof FIELD_TYPES)[number]

export interface Field {
  id: string // `f_<crypto.randomUUID()>`; stable, stored inside the Json column
  type: FieldType
  label: string
  help?: string
  required: boolean
  placeholder?: string
  options?: string[] // for select/radio/checkbox
}

export interface FormSettings {
  // M1b: empty. M2 adds confirmationMessage, etc.
}

export type FormStatus = 'DRAFT' | 'OPEN' | 'CLOSED'

export const fieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1).max(200),
  help: z.string().max(500).optional(),
  required: z.boolean(),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string().min(1)).optional(),
})

export const formSettingsSchema = z.object({}).strict()

export const createFormInput = z.object({
  name: z.string().min(1).max(100),
})

export const updateFormInput = z.object({
  formId: z.string().min(1),
  name: z.string().min(1).max(100),
  fields: z.array(fieldSchema),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']),
  settings: formSettingsSchema,
})

export type CreateFormInput = z.infer<typeof createFormInput>
export type UpdateFormInput = z.infer<typeof updateFormInput>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'bunx vitest run src/forms/schema.test.ts'
```
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/forms/schema.ts src/forms/schema.test.ts
git commit -m "feat(m1b): shared form schema (types + zod), client-safe"
```

---

### Task 3: Form service (`src/server/forms.ts`) + integration tests (TDD)

**Files:**
- Create: `src/server/forms.ts`
- Test: `src/server/forms.test.ts`

**Interfaces:**
- Consumes: `getPrisma` from `#/db`; `ensureOrgForUser` from `#/server/org` (in tests only); types from `#/forms/schema` (Task 2); prisma `Form` type from `#/generated/prisma/client` (type-only).
- Produces: `createForm(orgId, {name})`, `listForms(orgId)`, `getForm(orgId, formId)`, `updateForm(orgId, formId, input)`, `deleteForm(orgId, formId)`, and type `FormRecord`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test `src/server/forms.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { getPrisma } from '#/db'
import { ensureOrgForUser } from './org'
import {
  createForm,
  listForms,
  getForm,
  updateForm,
  deleteForm,
} from './forms'
import type { OrgMembership } from './org'

async function setupOrg(email: string): Promise<{ userId: string; org: OrgMembership }> {
  const prisma = await getPrisma()
  const user = await prisma.user.create({ data: { email, passwordHash: 'x' } })
  const org = await ensureOrgForUser(user.id, user.email)
  return { userId: user.id, org }
}

afterEach(async () => {
  const prisma = await getPrisma()
  await prisma.form.deleteMany({})
  await prisma.membership.deleteMany({})
  await prisma.organization.deleteMany({})
  await prisma.user.deleteMany({})
})

describe('createForm', () => {
  it('creates a DRAFT form with empty fields and a slug derived from the name', async () => {
    const { org } = await setupOrg(`cf${Math.random()}@x.test`)
    const form = await createForm(org.id, { name: 'Contact Us' })
    expect(form.orgId).toBe(org.id)
    expect(form.status).toBe('DRAFT')
    expect(form.fields).toEqual([])
    expect(form.slug).toMatch(/^contact-us-/)
  })

  it('produces unique slugs for two same-named forms in the same org', async () => {
    const { org } = await setupOrg(`us${Math.random()}@x.test`)
    const a = await createForm(org.id, { name: 'Signup' })
    const b = await createForm(org.id, { name: 'Signup' })
    expect(a.slug).not.toBe(b.slug)
  })
})

describe('listForms', () => {
  it('lists forms in the org', async () => {
    const { org } = await setupOrg(`lf${Math.random()}@x.test`)
    await createForm(org.id, { name: 'B' })
    await createForm(org.id, { name: 'A' })
    const names = (await listForms(org.id)).map((f) => f.name).sort()
    expect(names).toEqual(['A', 'B'])
  })
})

describe('getForm ownership', () => {
  it("returns null for another org's form (no existence leak)", async () => {
    const a = await setupOrg(`ga${Math.random()}@x.test`)
    const b = await setupOrg(`gb${Math.random()}@x.test`)
    const form = await createForm(a.org.id, { name: 'Private' })
    expect(await getForm(b.org.id, form.id)).toBeNull()
    expect(await getForm(a.org.id, form.id)).not.toBeNull()
  })
})

describe('updateForm', () => {
  it('updates name, fields, and status', async () => {
    const { org } = await setupOrg(`uf${Math.random()}@x.test`)
    const form = await createForm(org.id, { name: 'Old' })
    const updated = await updateForm(org.id, form.id, {
      formId: form.id,
      name: 'New',
      fields: [{ id: 'f_1', type: 'text', label: 'Name', required: true }],
      status: 'OPEN',
      settings: {},
    })
    expect(updated.name).toBe('New')
    expect(updated.status).toBe('OPEN')
    expect(updated.fields.length).toBe(1)
  })

  it('throws 404 when the form belongs to another org', async () => {
    const a = await setupOrg(`ua${Math.random()}@x.test`)
    const b = await setupOrg(`ub${Math.random()}@x.test`)
    const form = await createForm(a.org.id, { name: 'X' })
    await expect(
      updateForm(b.org.id, form.id, {
        formId: form.id,
        name: 'X',
        fields: [],
        status: 'DRAFT',
        settings: {},
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('deleteForm', () => {
  it('deletes the form', async () => {
    const { org } = await setupOrg(`df${Math.random()}@x.test`)
    const form = await createForm(org.id, { name: 'Gone' })
    await deleteForm(org.id, form.id)
    expect(await getForm(org.id, form.id)).toBeNull()
  })

  it('throws 404 and does NOT delete when the form belongs to another org', async () => {
    const a = await setupOrg(`da${Math.random()}@x.test`)
    const b = await setupOrg(`db${Math.random()}@x.test`)
    const form = await createForm(a.org.id, { name: 'Keep' })
    await expect(deleteForm(b.org.id, form.id)).rejects.toMatchObject({ status: 404 })
    expect(await getForm(a.org.id, form.id)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'dotenv -e .env.local -- bunx vitest run src/server/forms.test.ts'
```
Expected: FAIL — `Cannot find module './forms'`.

- [ ] **Step 3: Implement `src/server/forms.ts`**

```ts
import '@tanstack/react-start/server-only'
import type { Form as PrismaForm } from '#/generated/prisma/client'
import type { Field, FormSettings, FormStatus, UpdateFormInput } from '#/forms/schema'

export type FormRecord = Omit<PrismaForm, 'fields' | 'settings'> & {
  fields: Field[]
  settings: FormSettings
}

function toRecord(f: PrismaForm): FormRecord {
  return { ...f, fields: f.fields as Field[], settings: f.settings as FormSettings }
}

/** lowercase [a-z0-9-], trimmed, with a short random suffix for uniqueness */
export function buildSlugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const safeBase = base || 'form'
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${safeBase}-${suffix}`
}

async function uniqueSlug(orgId: string, name: string) {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = buildSlugFromName(name)
    const clash = await prisma.form.findUnique({
      where: { orgId_slug: { orgId, slug } },
      select: { id: true },
    })
    if (!clash) return slug
  }
  return `${buildSlugFromName(name)}${Math.random().toString(36).slice(2, 11)}`
}

function notFound(): Error {
  const err = new Error('Not found')
  // @ts-expect-error -- augment with an HTTP-ish status for the caller/router
  err.status = 404
  return err
}

export async function createForm(
  orgId: string,
  input: { name: string },
): Promise<FormRecord> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const slug = await uniqueSlug(orgId, input.name)
  const form = await prisma.form.create({
    data: {
      orgId,
      name: input.name,
      slug,
      status: 'DRAFT',
      fields: [],
      settings: {},
    },
  })
  return toRecord(form)
}

export async function listForms(
  orgId: string,
): Promise<Array<{ id: string; name: string; slug: string; status: FormStatus; updatedAt: Date }>> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  return prisma.form.findMany({
    where: { orgId },
    select: { id: true, name: true, slug: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function getForm(orgId: string, formId: string): Promise<FormRecord | null> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const form = await prisma.form.findUnique({ where: { id: formId } })
  if (!form || form.orgId !== orgId) return null // no existence leak
  return toRecord(form)
}

export async function updateForm(
  orgId: string,
  formId: string,
  input: UpdateFormInput,
): Promise<FormRecord> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const existing = await prisma.form.findUnique({ where: { id: formId } })
  if (!existing || existing.orgId !== orgId) throw notFound()

  // recompute the slug only if the name actually changed
  const slug =
    existing.name === input.name ? existing.slug : await uniqueSlug(orgId, input.name)

  const form = await prisma.form.update({
    where: { id: formId },
    data: {
      name: input.name,
      slug,
      status: input.status,
      fields: input.fields,
      settings: input.settings,
    },
  })
  return toRecord(form)
}

export async function deleteForm(orgId: string, formId: string): Promise<void> {
  const { getPrisma } = await import('#/db')
  const prisma = await getPrisma()
  const existing = await prisma.form.findUnique({ where: { id: formId } })
  if (!existing || existing.orgId !== orgId) throw notFound()
  await prisma.form.delete({ where: { id: formId } })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'dotenv -e .env.local -- bunx vitest run src/server/forms.test.ts'
```
Expected: PASS (all tests green).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'dotenv -e .env.local -- bunx vitest run'
```
Expected: PASS — existing 26 + new tests all green.

- [ ] **Step 6: Commit**

```bash
git add src/server/forms.ts src/server/forms.test.ts
git commit -m "feat(m1b): form service (CRUD + org-scoped ownership checks)"
```

---

### Task 4: Form server fns (`src/server/forms/functions.ts`)

**Files:**
- Create: `src/server/forms/functions.ts`

**Interfaces:**
- Consumes: `orgMiddleware` from `#/server/auth/org-middleware` (provides `context.currentOrg`); the service from `./forms` (Task 3); zod inputs from `#/forms/schema` (Task 2).
- Produces: server fns `listOrgForms`, `getOrgForm`, `createOrgForm`, `updateOrgForm`, `deleteOrgForm`. Consumed by Tasks 5–6.

> No dedicated unit tests for the fns (they are thin validators+middleware+service calls; the service logic is covered in Task 3). Verified by `bun run build` (wiring + no client leak) and the manual deploy check in Task 7.

- [ ] **Step 1: Implement `src/server/forms/functions.ts`**

```ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { orgMiddleware } from '#/server/auth/org-middleware'
import {
  createFormInput,
  updateFormInput,
} from '#/forms/schema'

// `./forms` (the service) is server-only — it lazily imports `#/db`. Import it
// lazily inside handlers so this client-imported module never leaks `pg`/Prisma
// into the client bundle (same discipline as auth/functions.ts).

function requireOrg(context: { currentOrg: { id: string } | null }): { id: string } {
  if (!context.currentOrg) throw new Error('No current org context')
  return context.currentOrg
}

export const listOrgForms = createServerFn({ method: 'GET' })
  .middleware([orgMiddleware])
  .handler(async ({ context }) => {
    const { listForms } = await import('./forms')
    return listForms(requireOrg(context).id)
  })

export const getOrgForm = createServerFn({ method: 'GET' })
  .validator(z.object({ formId: z.string().min(1) }))
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { getForm } = await import('./forms')
    return getForm(requireOrg(context).id, data.formId)
  })

export const createOrgForm = createServerFn({ method: 'POST' })
  .validator(createFormInput)
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { createForm } = await import('./forms')
    return createForm(requireOrg(context).id, data)
  })

export const updateOrgForm = createServerFn({ method: 'POST' })
  .validator(updateFormInput)
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { updateForm } = await import('./forms')
    return updateForm(requireOrg(context).id, data.formId, data)
  })

export const deleteOrgForm = createServerFn({ method: 'POST' })
  .validator(z.object({ formId: z.string().min(1) }))
  .middleware([orgMiddleware])
  .handler(async ({ data, context }) => {
    const { deleteForm } = await import('./forms')
    await deleteForm(requireOrg(context).id, data.formId)
    return { ok: true }
  })
```

- [ ] **Step 2: Verify build + lint (no client leak)**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'bun run build' 2>&1 | grep -c "externalized for browser compatibility"
```
Expected: `0` (the lazy-import discipline keeps `pg`/Prisma out of the client). Also confirm the build prints `✓ built` for both client and ssr environments.

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'bun run lint'
```
Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add src/server/forms/functions.ts
git commit -m "feat(m1b): form CRUD server fns (org-scoped via orgMiddleware)"
```

---

### Task 5: Routes — list + create + `/app` link

**Files:**
- Modify: `src/routes/_authenticated/app.tsx` (replace "Forms (none yet — M1b)" with a link)
- Create: `src/routes/_authenticated/app/forms/index.tsx`
- Create: `src/routes/_authenticated/app/forms/new.tsx`

**Interfaces:**
- Consumes: `listOrgForms`, `createOrgForm` from `#/server/forms/functions` (Task 4); M1a `logout` (existing) in `app.tsx`.

> UI has no automated tests in M1b (Playwright is deferred). Verify via `bun run build` and the manual deploy check in Task 7.

- [ ] **Step 1: Create the list view `src/routes/_authenticated/app/forms/index.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { listOrgForms } from '#/server/forms/functions'

export const Route = createFileRoute('/_authenticated/app/forms/')({
  component: FormsList,
})

function FormsList() {
  const [forms, setForms] = useState<Awaited<ReturnType<typeof listOrgForms>>>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listOrgForms()
      .then((f) => { if (alive) setForms(f) })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : 'Could not load forms') })
    return () => { alive = false }
  }, [])

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="demo-title">Forms</h1>
          <Link to="/app/forms/new" className="demo-button">New form</Link>
        </div>
        {err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : forms.length === 0 ? (
          <p className="demo-muted text-sm">No forms yet. Create your first.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {forms.map((f) => (
              <li key={f.id} className="flex items-center justify-between rounded border border-[var(--line)] px-3 py-2">
                <span className="font-medium">{f.name}</span>
                <span className="flex items-center gap-3">
                  <span className="demo-muted text-xs uppercase">{f.status}</span>
                  <Link to="/app/forms/$formId/edit" params={{ formId: f.id }} className="text-sm text-[var(--lagoon-deep)] underline">Edit</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="demo-muted mt-6 text-sm"><Link to="/app" className="underline">← Back to app</Link></p>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Create the create view `src/routes/_authenticated/app/forms/new.tsx`**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { createOrgForm } from '#/server/forms/functions'

export const Route = createFileRoute('/_authenticated/app/forms/new')({
  component: NewForm,
})

function NewForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      const form = await createOrgForm({ data: { name } })
      navigate({ to: '/app/forms/$formId/edit', params: { formId: form.id } })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create form')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <h1 className="demo-title mb-4">New form</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input className="demo-input" required placeholder="Form name"
            value={name} onChange={(e) => setName(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="demo-button" type="submit">Create</button>
        </form>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Wire `/app` to link to the list — modify `src/routes/_authenticated/app.tsx`**

Replace the block:
```tsx
          <div className="mb-6">
            <p className="text-sm">
              <span className="font-medium">{org.name}</span>
              {' '}·{' '}
              <span className="demo-muted">{org.role}</span>
            </p>
            <p className="demo-muted mt-3 text-sm">Forms (none yet — M1b)</p>
          </div>
```
with:
```tsx
          <div className="mb-6">
            <p className="text-sm">
              <span className="font-medium">{org.name}</span>
              {' '}·{' '}
              <span className="demo-muted">{org.role}</span>
            </p>
            <p className="mt-3 text-sm">
              <a href="/app/forms" className="text-[var(--lagoon-deep)] underline">Forms →</a>
            </p>
          </div>
```
(Add `Link` to the imports if you prefer a typed `<Link to="/app/forms">`; a plain anchor is fine and avoids touching the import list. If using `Link`, `import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'` and `<Link to="/app/forms">Forms →</Link>`.)

- [ ] **Step 4: Verify build + lint**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'bun run build && bun run lint'
```
Expected: build `✓ built` (both envs), lint `0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/app/forms/index.tsx src/routes/_authenticated/app/forms/new.tsx src/routes/_authenticated/app.tsx
git commit -m "feat(m1b): /app/forms list + new-form route; link from /app"
```

---

### Task 6: Field-editor route `src/routes/_authenticated/app/forms/$formId/edit.tsx`

**Files:**
- Create: `src/routes/_authenticated/app/forms/$formId/edit.tsx`

**Interfaces:**
- Consumes: `getOrgForm`, `updateOrgForm`, `deleteOrgForm` from `#/server/forms/functions` (Task 4); `FIELD_TYPES`, `Field` from `#/forms/schema` (Task 2).

- [ ] **Step 1: Implement the editor `src/routes/_authenticated/app/forms/$formId/edit.tsx`**

```tsx
import { createFileRoute, useNavigate, notFound } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getOrgForm, updateOrgForm, deleteOrgForm } from '#/server/forms/functions'
import { FIELD_TYPES, type Field, type FormStatus } from '#/forms/schema'

export const Route = createFileRoute('/_authenticated/app/forms/$formId/edit')({
  component: FormEditor,
})

const STATUSES: FormStatus[] = ['DRAFT', 'OPEN', 'CLOSED']

function newField(): Field {
  return { id: `f_${crypto.randomUUID()}`, type: 'text', label: '', required: false }
}

function FormEditor() {
  const { formId } = Route.useParams()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState<FormStatus>('DRAFT')
  const [fields, setFields] = useState<Field[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    getOrgForm({ data: { formId } })
      .then((f) => {
        if (!alive) return
        if (!f) { navigate({ to: '/app/forms' }); return }
        setName(f.name); setSlug(f.slug); setStatus(f.status); setFields(f.fields)
      })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : 'Could not load form') })
    return () => { alive = false }
  }, [formId])

  function update(id: string, patch: Partial<Field>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }
  function remove(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id))
  }
  function move(id: string, dir: -1 | 1) {
    setFields((fs) => {
      const i = fs.findIndex((f) => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= fs.length) return fs
      const copy = fs.slice()
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  async function onSave() {
    setErr(null); setSaved(false)
    try {
      await updateOrgForm({ data: { formId, name, fields, status, settings: {} } })
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function onDelete() {
    if (!confirm('Delete this form? This cannot be undone.')) return
    try {
      await deleteOrgForm({ data: { formId } })
      navigate({ to: '/app/forms' })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="demo-title">Edit form</h1>
          <select className="demo-input" value={status} onChange={(e) => setStatus(e.target.value as FormStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p className="demo-muted mb-1 text-xs">slug: {slug}</p>

        <label className="mb-4 block text-sm">
          Name
          <input className="demo-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Fields</h2>
          <button className="demo-button" type="button" onClick={() => setFields((fs) => [...fs, newField()])}>+ Add field</button>
        </div>

        <ul className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={f.id} className="rounded border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select className="demo-input" value={f.type} onChange={(e) => update(f.id, { type: e.target.value as Field['type'] })}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="demo-input min-w-[12rem] flex-1" placeholder="Label" value={f.label} onChange={(e) => update(f.id, { label: e.target.value })} />
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.required} onChange={(e) => update(f.id, { required: e.target.checked })} /> required</label>
                <button type="button" className="demo-button" disabled={i === 0} onClick={() => move(f.id, -1)}>↑</button>
                <button type="button" className="demo-button" disabled={i === fields.length - 1} onClick={() => move(f.id, 1)}>↓</button>
                <button type="button" className="demo-button" onClick={() => remove(f.id)}>Remove</button>
              </div>
              <input className="demo-input mt-2" placeholder="Help text (optional)" value={f.help ?? ''} onChange={(e) => update(f.id, { help: e.target.value || undefined })} />
              <input className="demo-input mt-2" placeholder="Placeholder (optional)" value={f.placeholder ?? ''} onChange={(e) => update(f.id, { placeholder: e.target.value || undefined })} />
              {(f.type === 'select' || f.type === 'radio' || f.type === 'checkbox') && (
                <input
                  className="demo-input mt-2"
                  placeholder="Options, comma-separated"
                  value={(f.options ?? []).join(', ')}
                  onChange={(e) => update(f.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              )}
            </li>
          ))}
        </ul>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
        {saved && <p className="mt-4 text-sm text-green-600">Saved.</p>}

        <div className="mt-6 flex items-center gap-3">
          <button className="demo-button" type="button" onClick={onSave}>Save</button>
          <button className="demo-button" type="button" onClick={onDelete}>Delete form</button>
        </div>
      </section>
    </main>
  )
}
```

> Note: `notFound` is imported but the empty/not-found case is handled by redirecting to `/app/forms` (TanStack Start's `notFound()` requires a throw in `beforeLoad`/`loader`; the component-level redirect is simpler here). If the import is unused, drop it to satisfy lint.

- [ ] **Step 2: Verify build + lint**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'bun run build && bun run lint'
```
Expected: build `✓ built`, lint `0 errors`. (If `notFound` is flagged as unused, remove it from the import.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/app/forms/$formId/edit.tsx
git commit -m "feat(m1b): structured field-editor route (/app/forms/$formId/edit)"
```

---

### Task 7: Full suite + deploy + manual verification

- [ ] **Step 1: Full test suite + lint + build**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'dotenv -e .env.local -- bunx vitest run && bun run lint && bun run build'
```
Expected: all tests green, lint `0 errors`, build `✓ built` (both envs, zero browser-externalize warnings).

- [ ] **Step 2: Deploy**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy; bun run deploy'
```
Expected: `✨ Success!` and `https://formharbor.jeanpaul20020519.workers.dev` (retry on "fetch failed").

- [ ] **Step 3: Manual smoke test (browser)**

1. Open the deployed URL → log in / register.
2. `/app` shows the org + a "Forms →" link.
3. Click → `/app/forms` (empty list).
4. "New form" → name it → lands in the editor.
5. Add 2–3 fields (text, select with options, required checkbox), reorder, set status OPEN, **Save** → "Saved."
6. Back to `/app/forms` → the form appears with status.
7. Edit again → delete → list is empty.

- [ ] **Step 4: Push the branch**

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -c 'unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy; git push -u origin feat/m1b-form-crud'
```

- [ ] **Step 5: Open a PR** `feat/m1b-form-crud → master` (stacked on the M1a PR if it isn't merged yet — switch the base to `feat/m1a-multi-tenant` until M1a merges, then retarget to `master`). PR body should summarize: Form model + FormStatus; shared `src/forms/schema.ts`; service with ownership checks; org-scoped server fns; list/create/editor UI; tests. Note M1b is builder-only (submission/logic/files deferred).

---

## Self-Review (completed during authoring)

- **Spec coverage:** Form model (Task 1) ✓; shared schema + zod (Task 2) ✓; service CRUD + ownership + slug (Task 3) ✓; server fns via orgMiddleware (Task 4) ✓; list/create routes + /app link (Task 5) ✓; structured editor (Task 6) ✓; deploy/verify (Task 7) ✓. Ownership/no-leak tested (Task 3). Field-id stability via `f_<uuid>` (Task 2 + 6). Slug uniqueness (Task 3).
- **Placeholders:** none — every code step has full code; every command has expected output.
- **Type consistency:** `FormRecord`, `Field`, `FormStatus`, `UpdateFormInput`, service fn signatures, and server-fn names match across tasks. `requireOrg` returns `{ id }` consistently.
- **Server-only discipline:** `forms.ts` is `server-only` + lazy `#/db`; `functions.ts` imports `./forms` lazily inside handlers; `schema.ts` has no server-only imports (client-safe). This is the explicit guard against repeating the M1a build break.
