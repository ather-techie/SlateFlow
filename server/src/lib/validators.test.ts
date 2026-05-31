import { describe, it, expect } from 'vitest'
import { dateSchema, optionalDateSchema } from './validators.js'

describe('dateSchema', () => {
  it('accepts valid dates', () => {
    expect(dateSchema.parse('2024-01-15')).toBe('2024-01-15')
    expect(dateSchema.parse('2000-02-29')).toBe('2000-02-29') // leap year
    expect(dateSchema.parse('2024-12-31')).toBe('2024-12-31')
  })

  it('rejects invalid date format', () => {
    const result1 = dateSchema.safeParse('01-15-2024')
    expect(result1.success).toBe(false)

    const result2 = dateSchema.safeParse('2024/01/15')
    expect(result2.success).toBe(false)

    const result3 = dateSchema.safeParse('not-a-date')
    expect(result3.success).toBe(false)

    const result4 = dateSchema.safeParse('2024-1-1')
    expect(result4.success).toBe(false) // missing zero-padding
  })

  it('rejects invalid calendar dates', () => {
    const result1 = dateSchema.safeParse('2024-02-30') // Feb doesn't have 30 days
    expect(result1.success).toBe(false)

    const result2 = dateSchema.safeParse('2024-13-01') // month 13 doesn't exist
    expect(result2.success).toBe(false)

    const result3 = dateSchema.safeParse('2024-00-01') // month 0 doesn't exist
    expect(result3.success).toBe(false)

    const result4 = dateSchema.safeParse('2023-02-29') // 2023 is not a leap year
    expect(result4.success).toBe(false)
  })

  it('parses valid dates to the input string', () => {
    expect(dateSchema.parse('2024-01-15')).toBe('2024-01-15')
  })
})

describe('optionalDateSchema', () => {
  it('accepts valid date strings', () => {
    expect(optionalDateSchema.parse('2024-01-15')).toBe('2024-01-15')
  })

  it('accepts null', () => {
    expect(optionalDateSchema.parse(null)).toBeNull()
  })

  it('accepts undefined', () => {
    expect(optionalDateSchema.parse(undefined)).toBeUndefined()
  })

  it('rejects invalid date strings', () => {
    const result1 = optionalDateSchema.safeParse('2024-02-30')
    expect(result1.success).toBe(false)

    const result2 = optionalDateSchema.safeParse('not-a-date')
    expect(result2.success).toBe(false)
  })
})
