import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const ok = <T>(c: Context, data: T, status: 200 | 201 = 200) =>
  c.json({ data, error: null }, status)

export const err = (c: Context, message: string, status: ContentfulStatusCode = 400) =>
  c.json({ data: null, error: message }, status)

export function parseId(s: string): number | null {
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function zodErr(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join('; ')
}
