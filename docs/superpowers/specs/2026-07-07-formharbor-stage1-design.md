# FormHarbor — Stage 1 Design (multi-tenant form builder SaaS)

Date: 2026-07-07
Status: Draft (pending user review)

> **Revision 2026-07-07 (during planning):** Auth changed from WorkOS to
> **self-hosted email/password**. Reason: `@workos/node` is unavailable on the
> npmmirror registry (404) and the official npmjs feed is unstable through this
> box's proxy, so WorkOS server-side integration is blocked; `authkit-react` is
> client-only. Self-hosted auth uses **Web Crypto PBKDF2** password hashing +
> an opaque session id in an HttpOnly cookie (TanStack Start primitives) + a
> local `User`/`Session` table. Net effect on this spec:
> - `User`: drop `workosUserId`, add `passwordHash`. `Organization`: drop `workosOrgId`.
> - Remove the WorkOS `AuthKitProvider` from `__root.tsx` (and the now-unneeded
>   `VITE_WORKOS_CLIENT_ID` placeholder / `src/integrations/workos/`).
> - New **M0 — Auth foundation** milestone precedes M1 (register/login/logout,
>   session, `getCurrentUser` middleware, `/login` `/register` `/_authenticated`).
> - Everywhere below, "WorkOS protects `/app/*`" is replaced by "self-hosted
>   session + `_authenticated` route guard". All other routes/models/permissions stand.
Stage: 1 of a multi-stage roadmap (see "Out of scope / later stages")

FormHarbor is a multi-tenant form/data-collection SaaS built on the existing
TanStack Start scaffold. Stage 1 delivers a functional product: organizations
create forms with conditional/multi-page logic, collect submissions via a public
link (with file uploads + anti-spam), and browse/export submissions in AG Grid.

## Goals & scope

**In scope (Stage 1 — "deluxe tier"):**
- Multi-tenant foundation: `Organization`, `User`, `Membership` (roles).
- Form CRUD with field types, **multi-page**, and **basic conditional logic**
  (show/hide, conditional-required, page jump).
- Public submission flow (no login), SSR, responsive, with progress bar.
- File uploads to **Cloudflare R2**.
- Anti-spam via **Cloudflare Turnstile**.
- Submission browsing in **AG Grid** (dynamic columns = fields) + CSV export.
- Auth-gated admin (`/app/*`) via WorkOS; org membership + role enforcement.
- Optional rate limiting on the public endpoint via the already-installed
  **@unkey/api**.

**Out of scope (later stages):**
- Email notifications / auto-responders (Resend) — Stage 4.
- Computed fields / expression engine / variables in logic — beyond basic rules.
- Team member invite flows, usage limits, billing, branding — Stage 5.
- Webhooks, API-key submissions, report builder.

## Architecture overview

- **Frontend:** TanStack Start (existing) + AG Grid + `react-hook-form` + `zod`
  (schemas generated dynamically from each form's `fields`).
- **Backend:** `createServerFn` for admin operations; a public server route for
  submissions. Rules evaluated on the client for UX and **re-verified server-side**
  on submit.
- **Auth:** WorkOS protects `/app/*`; `/f/:slug` is public.
- **Data:** postgres (Neon + Prisma, existing). Dynamic structures stored as
  **JSONB** (`fields`, `pages`, `logic`, `submission.data`). Every business table
  carries `orgId` for tenant isolation.
- **Files:** Cloudflare R2 via a wrangler binding; MVP uses **server-relayed
  upload** (server fn streams to R2) — presigned direct upload is a later optimisation.
- **Anti-spam:** Cloudflare Turnstile (site key public, secret server-side).
- **Rate limit (optional):** @unkey/api on the public submission route.
- **Deploy:** Cloudflare Workers (existing; `nodejs_compat` already on).

## Data model (Prisma)

```prisma
model Organization {
  id         String   @id @default(cuid())
  name       String
  slug       String   @unique
  workosOrgId String? // link to WorkOS organization
  createdAt  DateTime @default(now())
  memberships Membership[]
  forms      Form[]
}

model User {
  id          String   @id @default(cuid())
  email       String   @unique
  workosUserId String? @unique
  createdAt   DateTime @default(now())
  memberships Membership[]
}

model Membership {
  id      String @id @default(cuid())
  userId  String
  orgId   String
  role    Role   @default(MEMBER)
  user    User   @relation(fields: [userId], references: [id])
  org     Organization @relation(fields: [orgId], references: [id])
  @@unique([userId, orgId])
}

enum Role { OWNER ADMIN MEMBER }

model Form {
  id        String   @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id])
  name      String
  slug      String                  // unique per org
  status    FormStatus @default(DRAFT)
  fields    Json      // Field[]
  pages     Json      // Page[]   (>=1)
  logic     Json      // Rule[]   (may be [])
  settings  Json      // FormSettings
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  submissions Submission[]
  @@unique([orgId, slug])
}

enum FormStatus { DRAFT OPEN CLOSED }

model Submission {
  id        String   @id @default(cuid())
  formId    String
  orgId     String
  data      Json     // { [fieldId]: value } — only visible fields at submit time
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())
  form      Form     @relation(fields: [formId], references: [id])
}

model FileAsset {
  id           String  @id @default(cuid())
  orgId        String
  formId       String
  submissionId String?
  r2Key        String
  filename     String
  mimetype     String
  sizeBytes    Int
  createdAt    DateTime @default(now())
}
```

### Dynamic structures (TypeScript contracts)

```ts
type FieldType = 'text'|'textarea'|'number'|'email'|'date'|'select'|'radio'|'checkbox'|'file'

interface Field {
  id: string
  type: FieldType
  label: string
  help?: string
  required: boolean
  placeholder?: string
  pageId: string                 // which page this field belongs to
  options?: string[]             // for select/radio/checkbox
  accept?: string                // for file (MIME filter)
  maxSizeBytes?: number          // for file
}

interface Page { id: string; title: string }

interface Rule {
  id: string
  when: { fieldId: string; op: LogicOp; value: string | number | string[] }
  then:
    | { type: 'show'; targetFieldId: string }
    | { type: 'hide'; targetFieldId: string }
    | { type: 'require'; targetFieldId: string }
    | { type: 'goto'; targetPageId: string }
}

type LogicOp = 'equals'|'notEquals'|'contains'|'gt'|'gte'|'lt'|'lte'|'in'

interface FormSettings {
  turnstileEnabled: boolean
  thankYouMessage: string
  closedMessage: string
  allowMultipleSubmissions: boolean
}
```

## Conditional logic / multi-page engine

The form is a **page state machine**: render current page → fill → validate
required fields on that page → **evaluate rules** → decide next page + which
fields are visible → repeat → submit.

`evaluateLogic` is a **pure function** (the most heavily tested unit):

```ts
// contract
function evaluateLogic(
  logic: Rule[],
  values: Record<string, unknown>,
  currentPageId: string,
  allPages: Page[],
): { visibleFieldIds: Set<string>; nextPageId: string | null }
```

- Client runs it for live UX (show/hide, conditional required, next-page button).
- **Server re-runs it on submit** to (a) drop hidden-field values and
  (b) reject submissions that bypass required/visible-field rules.
- Scope (Stage 1): rules compare a **field value to a constant** only. No
  computed fields, cross-field references, or expressions.

## Routes & pages

**Admin (WorkOS-gated; requires `Membership` in the form's org):**
- `GET /app` — pick/create organization + list forms (AG Grid).
- `GET /app/forms/new` · `GET /app/forms/:id/edit` — builder (fields + pages + rules editor).
- `GET /app/forms/:id/submissions` — AG Grid, dynamic columns from `fields`, CSV export.
- `GET /app/forms/:id/settings` — slug, status, Turnstile toggle, thank-you/closed copy.

**Public (no login):**
- `GET /f/:slug` — multi-page form (SSR), progress bar, Turnstile widget.
- `GET /f/:slug/done` — thank-you page (custom copy).
- `POST /api/public/forms/:slug/submissions` — submit endpoint.

## Server functions & permissions

- Admin server fns (e.g. `createForm`, `updateForm`, `listSubmissions`,
  `getPresignedUpload`/`relayUpload`) all go through a `requireOrgMember`
  middleware that injects `currentOrg` and enforces role:
  - OWNER/ADMIN: full edit.
  - MEMBER: read-only on submissions.
- Public submission server route: Turnstile verify (if enabled) → build `zod`
  schema from `fields` → validate → relay files to R2 (write `FileAsset`) →
  persist `Submission` (only visible fields) → return `{ submissionId }`.
- Optional `@unkey/api` rate limit on the public route.

## File upload (R2)

MVP = **server-relayed**:
1. Client posts `multipart/form-data` to the submit route.
2. Server fn streams each file to R2 via the binding (`env.FORM_FILES.put(key, stream)`).
3. `FileAsset` rows written; `submission.data[fieldId]` stores the `r2Key`.
Limits: per-file `maxSizeBytes` + allowed `accept` MIME types, enforced server-side.
(Optimisation for later: presigned direct upload.)

`wrangler.jsonc` adds:
```jsonc
"r2_buckets": [{ "binding": "FORM_FILES", "bucket_name": "<bucket>" }]
```

## Turnstile

- Public page embeds the Turnstile widget with the public `VITE_TURNSTILE_SITE_KEY`.
- Submit sends the token; the server route verifies it with `TURNSTILE_SECRET_KEY`
  via `https://challenges.cloudflare.com/turnstile/v0/siteverify`.

## Error handling & boundaries

- Form `CLOSED` or slug not found → friendly "form closed / not found" page (still SSR).
- Slug collision on create/edit → builder field-level error.
- File over size / disallowed type → field-level error.
- Turnstile fail → reject submission with message.
- zod validation fail → field-level errors echoed to the public page.
- Insufficient role → 403.
- Org has no forms → empty state with CTA.

## Testing (vitest, existing)

- **`evaluateLogic`** — primary unit; cases for each op, show/hide/require/goto,
  hidden-field stripping, multi-page ordering.
- Dynamic `zod` schema generation from `fields` (per type + required).
- `requireOrgMember` middleware (role enforcement, cross-org denial).
- Public submit route: happy path, Turnstile-off/on, validation fail, file limits.
- (Optional) Playwright end-to-end for the multi-page public flow.

## New environment variables

```
# Client-exposed
VITE_TURNSTILE_SITE_KEY=

# Server-only (secret)
TURNSTILE_SECRET_KEY=
# R2 is accessed via binding; if presigned uploads are added later, also:
# R2_ACCOUNT_ID=  R2_ACCESS_KEY_ID=  R2_SECRET_ACCESS_KEY=

# Optional rate limiting (already-installed package)
UNKEY_API_KEY=  UNKEY_API_ID=
```
WorkOS, DATABASE_URL, Sentry already exist. Resend is **not** needed in Stage 1.

## Internal milestones (de-risk the large stage)

- **M1** — Multi-tenant foundation + Form CRUD (no logic, no files): org/membership,
  WorkOS org select, create/edit/list forms, basic fields model.
- **M2** — Public single-page fill + Submission + AG Grid browse: end-to-end closed loop.
- **M3** — File upload (R2 binding, server-relayed) + Turnstile.
- **M4** — Multi-page + conditional logic engine + rule editor in builder.
- **M5** — Dynamic AG Grid columns, CSV export, permission polish, test coverage.

Each milestone is independently shippable / reviewable.

## Open questions

None blocking. (Resend, billing, invites, presigned uploads, computed fields are
explicitly deferred to later stages.)
