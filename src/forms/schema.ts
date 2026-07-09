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

/**
 * Build a zod schema from a Field[] for validating submission values.
 * - required strings/arrays must be non-empty; optional fields may be absent.
 * - number is coerced; email validated; select/radio → enum(options);
 *   checkbox → array(enum(options)); date kept as ISO string (M2).
 * - Unknown keys are stripped (zod object default).
 * (M4 will reuse this for visible-field-only validation.)
 */
function fieldToZod(f: Field): z.ZodTypeAny {
  let s: z.ZodTypeAny
  switch (f.type) {
    case 'number':
      s = z.coerce.number()
      break
    case 'email':
      s = z.string().email()
      break
    case 'select':
    case 'radio':
      s = f.options?.length
        ? z.enum(f.options as [string, ...string[]])
        : z.string()
      break
    case 'checkbox':
      s = f.options?.length
        ? z.array(z.enum(f.options as [string, ...string[]]))
        : z.array(z.string())
      break
    case 'date':
    case 'text':
    case 'textarea':
    default:
      s = z.string()
      break
  }
  if (f.required) {
    if (s instanceof z.ZodString) s = s.min(1)
    else if (s instanceof z.ZodArray) s = s.min(1)
  } else {
    s = s.optional()
  }
  return s
}

export function fieldsToZodSchema(
  fields: Field[],
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) shape[f.id] = fieldToZod(f)
  return z.object(shape)
}
