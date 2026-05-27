import { describe, it, expect } from 'vitest'
import { parseId, zodErr } from './response'

// ---------------------------------------------------------------------------
// parseId
// ---------------------------------------------------------------------------
describe('parseId', () => {
  // --- positive cases ---
  describe('valid positive integers', () => {
    it('returns 1 for "1"', () => {
      expect(parseId('1')).toBe(1)
    })

    it('returns 42 for "42"', () => {
      expect(parseId('42')).toBe(42)
    })

    it('returns 999 for "999"', () => {
      expect(parseId('999')).toBe(999)
    })

    it('returns MAX_SAFE_INTEGER for its string representation', () => {
      const max = Number.MAX_SAFE_INTEGER // 9007199254740991
      expect(parseId(String(max))).toBe(max)
    })
  })

  // --- negative cases (must return null) ---
  describe('invalid inputs that return null', () => {
    it('returns null for "0" (zero is not a valid id)', () => {
      expect(parseId('0')).toBeNull()
    })

    it('returns null for "-1" (negative)', () => {
      expect(parseId('-1')).toBeNull()
    })

    it('returns null for "-42" (negative)', () => {
      expect(parseId('-42')).toBeNull()
    })

    it('returns null for "abc" (non-numeric)', () => {
      expect(parseId('abc')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseId('')).toBeNull()
    })

    it('returns null for "NaN"', () => {
      expect(parseId('NaN')).toBeNull()
    })

    it('returns null for "Infinity"', () => {
      expect(parseId('Infinity')).toBeNull()
    })

    it('returns null for "0x10" (hex rejected by parseInt with radix 10)', () => {
      // parseInt('0x10', 10) === NaN because base-10 stops at 'x'
      expect(parseId('0x10')).toBeNull()
    })
  })

  // --- edge cases that reveal parseInt behaviour ---
  describe('edge cases that document parseInt behaviour', () => {
    it('returns 1 for "1.5" (parseInt truncates fractional part)', () => {
      // parseInt('1.5', 10) === 1
      expect(parseId('1.5')).toBe(1)
    })

    it('returns 1 for "1.0" (decimal point treated as stop by parseInt)', () => {
      expect(parseId('1.0')).toBe(1)
    })

    it('returns 3 for " 3" (parseInt trims leading whitespace)', () => {
      expect(parseId(' 3')).toBe(3)
    })

    it('returns 1 for "1e2" (parseInt stops at "e", does not evaluate scientific notation)', () => {
      // parseInt('1e2', 10) === 1, not 100
      expect(parseId('1e2')).toBe(1)
    })

    it('returns 3 for "3abc" (parseInt stops at first non-digit)', () => {
      // parseInt('3abc', 10) === 3
      expect(parseId('3abc')).toBe(3)
    })
  })
})

// ---------------------------------------------------------------------------
// zodErr
// ---------------------------------------------------------------------------
describe('zodErr', () => {
  // --- positive cases ---
  it('formats a single issue', () => {
    expect(zodErr([{ message: 'Required' }])).toBe('Required')
  })

  it('joins multiple issues with "; "', () => {
    expect(
      zodErr([
        { message: 'Required' },
        { message: 'Must be a string' },
        { message: 'Too short' },
      ])
    ).toBe('Required; Must be a string; Too short')
  })

  // --- edge cases ---
  it('returns an empty string for an empty issues array', () => {
    expect(zodErr([])).toBe('')
  })

  it('includes an empty string segment for an issue with an empty message', () => {
    expect(zodErr([{ message: '' }, { message: 'Present' }])).toBe('; Present')
  })

  it('returns the single message unchanged when it contains a semicolon', () => {
    // zodErr does not escape the messages themselves
    expect(zodErr([{ message: 'a; b' }])).toBe('a; b')
  })
})
