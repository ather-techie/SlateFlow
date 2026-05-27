import { describe, it, expect } from 'vitest'
import { signToken, verifyToken, hashPassword, verifyPassword } from './auth'

describe('signToken', () => {
  it('returns a non-empty string token', async () => {
    const token = await signToken({ sub: 1, email: 'test@example.com', role: 'admin' })
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('signs token with different payloads distinctly', async () => {
    const token1 = await signToken({ sub: 1, email: 'user1@example.com', role: 'admin' })
    const token2 = await signToken({ sub: 2, email: 'user2@example.com', role: 'viewer' })
    expect(token1).not.toBe(token2)
  })
})

describe('verifyToken / signToken round-trip', () => {
  it('decodes a signed token back to the original payload', async () => {
    const payload = { sub: 123, email: 'alice@example.com', role: 'contributor' }
    const token = await signToken(payload)
    const decoded = await verifyToken(token)

    expect(decoded).not.toBeNull()
    expect(decoded?.sub).toBe(123)
    expect(decoded?.email).toBe('alice@example.com')
    expect(decoded?.role).toBe('contributor')
  })

  it('includes iat (issued-at) timestamp', async () => {
    const token = await signToken({ sub: 1, email: 'test@example.com', role: 'admin' })
    const decoded = await verifyToken(token)

    expect(decoded?.iat).toBeDefined()
    expect(typeof decoded?.iat).toBe('number')
    expect(decoded!.iat).toBeGreaterThan(0)
  })

  it('includes exp (expiry) timestamp ~7 days from now', async () => {
    const beforeSign = Math.floor(Date.now() / 1000)
    const token = await signToken({ sub: 1, email: 'test@example.com', role: 'admin' })
    const afterSign = Math.floor(Date.now() / 1000)

    const decoded = await verifyToken(token)
    expect(decoded?.exp).toBeDefined()

    // 7 days = 604800 seconds
    const expectedExp = beforeSign + 7 * 24 * 3600
    const expectedExpUpper = afterSign + 7 * 24 * 3600

    expect(decoded!.exp).toBeGreaterThanOrEqual(expectedExp - 5)
    expect(decoded!.exp).toBeLessThanOrEqual(expectedExpUpper + 5)
  })

  it('expiry is exactly 7 days later (within 1 second margin)', async () => {
    const token = await signToken({ sub: 1, email: 'test@example.com', role: 'admin' })
    const decoded = await verifyToken(token)

    const sevenDaysSeconds = 7 * 24 * 3600
    const expiryDelta = decoded!.exp - decoded!.iat
    expect(expiryDelta).toBe(sevenDaysSeconds)
  })
})

describe('verifyToken', () => {
  it('returns null for garbage string', async () => {
    const result = await verifyToken('not.a.valid.jwt')
    expect(result).toBeNull()
  })

  it('returns null for empty string', async () => {
    const result = await verifyToken('')
    expect(result).toBeNull()
  })

  it('returns null for malformed JWT (wrong signature)', async () => {
    const token = await signToken({ sub: 1, email: 'test@example.com', role: 'admin' })
    // Corrupt the signature by flipping a character
    const corrupted = token.slice(0, -1) + (token[token.length - 1] === 'a' ? 'b' : 'a')
    const result = await verifyToken(corrupted)
    expect(result).toBeNull()
  })

  it('returns null for undefined input', async () => {
    const result = await verifyToken(undefined as unknown as string)
    expect(result).toBeNull()
  })

  it('returns null for null input', async () => {
    const result = await verifyToken(null as unknown as string)
    expect(result).toBeNull()
  })
})

describe('hashPassword', () => {
  it('returns a non-empty string hash', () => {
    const hash = hashPassword('mypassword')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('hashes same password differently each time (bcrypt salt)', () => {
    const password = 'test123'
    const hash1 = hashPassword(password)
    const hash2 = hashPassword(password)
    expect(hash1).not.toBe(hash2)
  })

  it('hash starts with bcrypt prefix $2', () => {
    const hash = hashPassword('password')
    expect(hash).toMatch(/^\$2[aby]\$/)
  })

  it('hash is approximately 60 characters (bcrypt standard)', () => {
    const hash = hashPassword('password')
    expect(hash.length).toBe(60)
  })

  it('handles empty string password', () => {
    const hash = hashPassword('')
    expect(hash.length).toBe(60)
    expect(hash).toMatch(/^\$2[aby]\$/)
  })

  it('handles very long password', () => {
    const longPassword = 'x'.repeat(1000)
    const hash = hashPassword(longPassword)
    expect(hash.length).toBe(60)
    expect(hash).toMatch(/^\$2[aby]\$/)
  })
})

describe('verifyPassword', () => {
  it('returns true when plain password matches the hash', () => {
    const password = 'correct_password'
    const hash = hashPassword(password)
    const result = verifyPassword(password, hash)
    expect(result).toBe(true)
  })

  it('returns false when plain password does not match hash', () => {
    const password = 'correct_password'
    const hash = hashPassword(password)
    const result = verifyPassword('wrong_password', hash)
    expect(result).toBe(false)
  })

  it('returns false for empty string password against non-empty hash', () => {
    const hash = hashPassword('real_password')
    const result = verifyPassword('', hash)
    expect(result).toBe(false)
  })
})

describe('verifyPassword / hashPassword round-trip', () => {
  it('round-trips a complex password with special characters', () => {
    const password = 'P@$$w0rd!#$%^&*()'
    const hash = hashPassword(password)
    const result = verifyPassword(password, hash)
    expect(result).toBe(true)
  })

  it('round-trips a long password', () => {
    const password = 'This is a longer password with spaces and numbers 12345'
    const hash = hashPassword(password)
    const result = verifyPassword(password, hash)
    expect(result).toBe(true)
  })

  it('round-trips unicode characters', () => {
    const password = 'пароль密码🔐'
    const hash = hashPassword(password)
    const result = verifyPassword(password, hash)
    expect(result).toBe(true)
  })

  it('round-trips across multiple hash cycles', () => {
    const password = 'test'
    const hash1 = hashPassword(password)
    const matches1 = verifyPassword(password, hash1)

    const hash2 = hashPassword(password)
    const matches2 = verifyPassword(password, hash2)

    expect(matches1).toBe(true)
    expect(matches2).toBe(true)
    expect(hash1).not.toBe(hash2)
  })
})
