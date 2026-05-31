import { describe, it, expect } from 'vitest'
import { buildUpdate } from './buildUpdate'

describe('buildUpdate', () => {
  it('returns null when no fields provided', () => {
    const result = buildUpdate({}, ['name', 'color'])
    expect(result).toBeNull()
  })

  it('returns null when only disallowed fields provided', () => {
    const result = buildUpdate({ foo: 'bar', baz: 123 }, ['name', 'color'])
    expect(result).toBeNull()
  })

  it('builds UPDATE with single allowed field', () => {
    const result = buildUpdate({ name: 'New Title' }, ['name', 'color'])
    expect(result).not.toBeNull()
    expect(result?.sql).toBe('name = ?, updated_at = datetime(\'now\')')
    expect(result?.params).toEqual(['New Title'])
  })

  it('builds UPDATE with multiple allowed fields', () => {
    const result = buildUpdate({ name: 'New Title', color: '#ff0000' }, ['name', 'color'])
    expect(result).not.toBeNull()
    expect(result?.sql).toContain('name = ?')
    expect(result?.sql).toContain('color = ?')
    expect(result?.sql).toContain('updated_at = datetime(\'now\')')
    expect(result?.params).toEqual(['New Title', '#ff0000'])
  })

  it('treats undefined values as null in fields', () => {
    const result = buildUpdate({ name: 'Title', color: undefined, priority: 'p1' }, ['name', 'color', 'priority'])
    expect(result).not.toBeNull()
    expect(result?.sql).toContain('name = ?')
    expect(result?.sql).toContain('color = ?')
    expect(result?.sql).toContain('priority = ?')
    // undefined values are converted to null
    expect(result?.params).toEqual(['Title', null, 'p1'])
  })

  it('includes timestamp when withTimestamp is true (default)', () => {
    const result = buildUpdate({ name: 'New' }, ['name'])
    expect(result?.sql).toContain('updated_at = datetime(\'now\')')
  })

  it('excludes timestamp when withTimestamp is false', () => {
    const result = buildUpdate({ name: 'New' }, ['name'], { withTimestamp: false })
    expect(result?.sql).toBe('name = ?')
    expect(result?.sql).not.toContain('updated_at')
    expect(result?.params).toEqual(['New'])
  })

  it('handles boolean values correctly', () => {
    const result = buildUpdate({ is_active: true }, ['is_active'], { withTimestamp: false })
    expect(result?.params).toEqual([true])
  })

  it('handles null values correctly', () => {
    const result = buildUpdate({ description: null }, ['description'], { withTimestamp: false })
    expect(result?.params).toEqual([null])
  })

  it('filters out disallowed fields silently', () => {
    const result = buildUpdate(
      { name: 'Title', secret: 'should-not-appear', priority: 'p2' },
      ['name', 'priority'],
    )
    expect(result?.sql).not.toContain('secret')
    expect(result?.params).toEqual(['Title', 'p2'])
  })

  it('preserves field order based on allowed list', () => {
    const result = buildUpdate(
      { priority: 'p1', name: 'Title', color: '#ff0000' },
      ['name', 'color', 'priority'],
    )
    // Verify all fields are present
    const sql = result?.sql || ''
    expect(sql).toContain('name = ?')
    expect(sql).toContain('color = ?')
    expect(sql).toContain('priority = ?')
    expect(result?.params).toEqual(['Title', '#ff0000', 'p1'])
  })
})
