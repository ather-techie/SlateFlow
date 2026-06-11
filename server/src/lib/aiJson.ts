/**
 * Parse a model response that is expected to be JSON. Models sometimes wrap
 * the JSON in prose or code fences, so on a direct-parse failure we fall back
 * to extracting the outermost array/object before giving up.
 *
 * Returns null when no valid JSON of the expected shape can be recovered.
 */
export function parseAiJson<T>(raw: string, expect: 'array' | 'object'): T | null {
  const trimmed = raw.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const pattern = expect === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/
    const match = trimmed.match(pattern)
    if (!match) {
      console.error('AI response (no JSON found):', trimmed.substring(0, 500))
      return null
    }
    try {
      parsed = JSON.parse(match[0])
    } catch (e) {
      console.error('Extracted JSON parse error:', e instanceof Error ? e.message : String(e))
      console.error('Extracted content:', match[0].substring(0, 500))
      return null
    }
  }

  if (expect === 'array' && !Array.isArray(parsed)) return null
  if (expect === 'object' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) return null
  return parsed as T
}
