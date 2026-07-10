# FormHarbor — M2 Design: Public fill + Submission + browse

**Date:** 2026-07-09
**Status:** Executing (derived from the stage-1 design; user delegated decisions)
**Milestone:** M2
**Parent spec:** `docs/superpowers/specs/2026-07-07-formharbor-stage1-design.md`
**Depends on:** M1b (`Form`, `Field`, org middleware)

## Goal

Close the end-to-end loop: a published form can be filled publicly and the org
member can browse submissions. **Single-page only** (multi-page + logic = M4),
**no Turnstile** (M3), **no file upload** (M3).

## Scope

### In scope
- `Submission` Prisma model.
- Public route `GET /f/:orgSlug/:formSlug` — SSR the form (OPEN only).
- Public submit server fn — build a zod schema from the form's `fields`, validate,
  persist a `Submission`.
- Admin browse route `GET /app/forms/$formId/submissions` — simple table.
- Tests (service + public lookup).

### Out of scope (later milestones)
- Multi-page, conditional logic, hidden-field stripping on submit → **M4**.
- Turnstile, rate limiting → **M3**.
- File field type / R2 / `FileAsset` → **M3**.
- AG Grid dynamic columns + CSV export + role-based browse perms → **M5**. (M2 uses
  a plain HTML table; any member can browse.)

### Deviation from the stage-1 spec
- Public route is `/f/:orgSlug/:formSlug`, not `/f/:slug`. Form `slug` is unique
  per org (`@@unique([orgId, slug])`), so a single `:slug` is ambiguous across
  orgs; the org `slug` is globally unique (`@unique`), so the pair is unique.

## Data model (Prisma)

Add to `prisma/schema.prisma`:

```prisma
model Submission {
  id        String   @id @default(cuid())
  formId    String
  orgId     String
  data      Json                              // { [fieldId]: value }
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())
  form      Form     @relation(fields: [formId], references: [id], onDelete: Cascade)

  @@index([formId])
  @@index([orgId])
}
```

`Form` gains `submissions Submission[]`. (`FileAsset` is M3 — not added now.)

## Shared schema additions — `src/forms/schema.ts`

Add a helper that derives a zod schema from a `Field[]` (used by the public submit
to validate values, and re-used by M4 for visible-field validation):

```ts
export function fieldsToZodSchema(fields: Field[]): z.ZodType<Record<string, unknown>>
```

Rules: required → `.min(1)` / non-empty; type-specific coercions — `number` →
`z.coerce.number()`, `email` → `z.string().email()`, `date` → `z.string()` (ISO,
kept as string for M2), `select/radio` → `z.enum(options)` (single), `checkbox` →
`z.array(z.enum(options))`, `text/textarea` → `z.string()`. Unknown keys stripped.
Optional fields may be absent. (File type is M3 — not handled here.)

## Service — `src/server/submissions.ts` (server-only, lazy `#/db`)

```ts
getFormBySlug(orgSlug: string, formSlug: string): Promise<FormRecord | null>
  // join Organization on slug + Form on slug; return null unless status === 'OPEN'

createSubmission(input: { orgSlug: string; formSlug: string; values: Record<string, unknown>; meta?: { ip?: string; userAgent?: string } }):
  Promise<{ id: string }>
  // load OPEN form by slug; fieldsToZodSchema(fields).parse(values); insert Submission
  // { formId, orgId, data: values, ip, userAgent }

listSubmissions(orgId: string, formId: string): Promise<SubmissionRow[]>
  // verify form.orgId === orgId (else []); select id, data, ip, userAgent, createdAt; newest first
```

## Server fns

- **Public** (`src/server/submissions/public.ts`) — no auth middleware:
  - `getPublicForm({ orgSlug, formSlug })` → `{ name, fields, orgName } | null` (for SSR).
  - `submitSubmission({ orgSlug, formSlug, values })` → `{ id }`. (ip/userAgent
    gathered server-side via `getRequestHeader` if available; optional.)
- **Admin** (`src/server/submissions/functions.ts`) — `orgMiddleware`:
  - `listOrgFormSubmissions({ formId })` → `SubmissionRow[]`.

All use the `#/server/submissions` alias (relative imports break in `tss-serverfn-split`).

## Routes

- **`GET /f/$orgSlug/$formSlug`** (`src/routes/f/$orgSlug/$formSlug.tsx`) — public.
  Loader calls `getPublicForm`; if null → `notFound()`. Renders the form by field
  type (text/textarea/email/number/date → `<input>`/`<textarea>`; select/radio →
  `<select>`/radios; checkbox → checkboxes). On submit → `submitSubmission` →
  show "Thank you" inline (replace the form). No auth layout.
- **`GET /app/forms/$formId/submissions`** (`.../submissions.tsx`) — under
  `_authenticated`. Loader calls `listOrgFormSubmissions`; renders a plain table
  (one row per submission: created at, IP, a compact `data` view). "Back to edit".

## Error handling

- Non-existent or non-`OPEN` form on the public route → 404 (`notFound()`).
- Validation failure on submit → throw with a message; the public form shows it.
- Admin browse on another org's form → empty (ownership check; no leak).

## Testing

- `src/forms/schema.test.ts`: add cases for `fieldsToZodSchema` (required
  missing → throws; number coercion; enum validation; unknown keys stripped).
- `src/server/submissions.test.ts` (DB integration):
  - `getFormBySlug`: OPEN form found; DRAFT/CLOSED → null; wrong org → null.
  - `createSubmission`: valid values → Submission row with `data`; required-missing → throws.
  - `listSubmissions`: returns the form's submissions; cross-org → `[]`.

## Acceptance

- DB pushed; `dotenv -e .env.local -- vitest run` green; `bun run lint` clean;
  `bun run build` clean (0 client leak).
- Manual: set a form to OPEN → open `/f/<orgSlug>/<formSlug>` → fill → submit →
  see "Thank you" → in `/app/forms/$formId/submissions` see the row.
