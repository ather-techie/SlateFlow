import { describe, it, expect } from 'vitest'
import { parseAiJson } from './aiJson'

describe('parseAiJson', () => {
  it('parses a clean JSON object', () => {
    expect(parseAiJson<{ a: number }>('{"a":1}', 'object')).toEqual({ a: 1 })
  })

  it('parses a clean JSON array', () => {
    expect(parseAiJson<number[]>('[1,2,3]', 'array')).toEqual([1, 2, 3])
  })

  it('parses JSON wrapped in markdown code fences', () => {
    const raw = '```json\n[{"title":"x"}]\n```'
    expect(parseAiJson<Array<{ title: string }>>(raw, 'array')).toEqual([{ title: 'x' }])
  })

  it('parses JSON wrapped in prose', () => {
    const raw = 'Here is the result:\n{"summary":"ok"}\nHope that helps!'
    expect(parseAiJson<{ summary: string }>(raw, 'object')).toEqual({ summary: 'ok' })
  })

  it('returns null for garbage', () => {
    expect(parseAiJson('not json at all', 'object')).toBeNull()
    expect(parseAiJson('not json at all', 'array')).toBeNull()
  })

  it('returns null when expecting an array but getting an object', () => {
    expect(parseAiJson('{"a":1}', 'array')).toBeNull()
  })

  it('returns null when expecting an object but getting an array', () => {
    expect(parseAiJson('[1,2]', 'object')).toBeNull()
  })

  it('returns null when expecting an object but getting a scalar', () => {
    expect(parseAiJson('42', 'object')).toBeNull()
    expect(parseAiJson('"hello"', 'object')).toBeNull()
    expect(parseAiJson('null', 'object')).toBeNull()
  })

  it('returns null when the extracted fragment is still invalid', () => {
    expect(parseAiJson('prefix {broken json] suffix', 'object')).toBeNull()
  })

  it('handles leading/trailing whitespace', () => {
    expect(parseAiJson('  \n {"a":1} \n ', 'object')).toEqual({ a: 1 })
  })
})
