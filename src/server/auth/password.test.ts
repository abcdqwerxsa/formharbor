import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('hashes then verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash.startsWith('pbkdf2$')).toBe(true)
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('hunter2')
    expect(await verifyPassword('hunter3', hash)).toBe(false)
  })

  it('produces different salts (different hashes for same password)', async () => {
    const a = await hashPassword('same')
    const b = await hashPassword('same')
    expect(a).not.toBe(b)
  })

  it('rejects a malformed stored value', async () => {
    expect(await verifyPassword('x', 'not-a-valid-hash')).toBe(false)
  })
})
