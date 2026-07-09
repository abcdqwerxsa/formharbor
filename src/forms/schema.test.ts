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
      updateFormInput.parse({
        ...valid,
        fields: [{ id: 'x', type: 'nope', label: 'Y', required: false }],
      }),
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
