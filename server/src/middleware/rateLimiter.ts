import type { Context, Next } from 'hono'
import { err } from '../lib/response.js'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.env?.remoteAddr || '127.0.0.1'
    const now = Date.now()
    const entry = rateLimitStore.get(ip)

    if (entry && entry.resetAt > now) {
      if (entry.count >= maxRequests) {
        return err(c, 'too many requests', 429)
      }
      entry.count++
    } else {
      rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs })
    }

    // Cleanup old entries every 1000 requests
    if (rateLimitStore.size > 1000) {
      for (const [key, val] of rateLimitStore.entries()) {
        if (val.resetAt <= now) rateLimitStore.delete(key)
      }
    }

    await next()
  }
}

// Pre-created limiters for common routes
export const loginRateLimiter = createRateLimiter(10, 15 * 60 * 1000) // 10 attempts per 15 min
export const aiRateLimiter = createRateLimiter(30, 60 * 1000) // 30 requests per min
