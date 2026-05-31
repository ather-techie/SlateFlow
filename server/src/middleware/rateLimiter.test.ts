import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { createRateLimiter, loginRateLimiter, aiRateLimiter } from './rateLimiter.js'

describe('createRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const limiter = createRateLimiter(3, 60000)
    const app = new Hono()
    app.use('*', limiter)
    app.get('/', (c) => c.text('ok'))

    const ip = { headers: { 'x-forwarded-for': '10.0.0.1' } }
    const res1 = await app.request('/', { ...ip })
    const res2 = await app.request('/', { ...ip })
    const res3 = await app.request('/', { ...ip })

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(res3.status).toBe(200)
  })

  it('returns 429 after exceeding limit', async () => {
    const limiter = createRateLimiter(2, 60000)
    const app = new Hono()
    app.use('*', limiter)
    app.get('/', (c) => c.text('ok'))

    const ip = { headers: { 'x-forwarded-for': '10.0.0.2' } }
    await app.request('/', { ...ip })
    await app.request('/', { ...ip })
    const res3 = await app.request('/', { ...ip })

    expect(res3.status).toBe(429)
    const body = await res3.json()
    expect(body.error).toBe('too many requests')
  })

  it('isolates rate limits by IP', async () => {
    const limiter = createRateLimiter(1, 60000)
    const app = new Hono()
    app.use('*', limiter)
    app.get('/', (c) => c.text('ok'))

    const ip1 = { headers: { 'x-forwarded-for': '10.0.0.3' } }
    const ip2 = { headers: { 'x-forwarded-for': '10.0.0.4' } }

    // IP1 exhausts limit
    const res1 = await app.request('/', { ...ip1 })
    expect(res1.status).toBe(200)
    const res2 = await app.request('/', { ...ip1 })
    expect(res2.status).toBe(429)

    // IP2 should still get through
    const res3 = await app.request('/', { ...ip2 })
    expect(res3.status).toBe(200)
  })

  it('resets counter after window expires', async () => {
    const windowMs = 100
    const limiter = createRateLimiter(1, windowMs)
    const app = new Hono()
    app.use('*', limiter)
    app.get('/', (c) => c.text('ok'))

    const ip = { headers: { 'x-forwarded-for': '10.0.0.5' } }

    // First request succeeds
    const res1 = await app.request('/', { ...ip })
    expect(res1.status).toBe(200)

    // Second request fails (within window)
    const res2 = await app.request('/', { ...ip })
    expect(res2.status).toBe(429)

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, windowMs + 10))

    // Third request succeeds (new window)
    const res3 = await app.request('/', { ...ip })
    expect(res3.status).toBe(200)
  })

  it('defaults IP to 127.0.0.1 when header absent', async () => {
    const limiter = createRateLimiter(1, 60000)
    const app = new Hono()
    app.use('*', limiter)
    app.get('/', (c) => c.text('ok'))

    // Make two requests without x-forwarded-for header (both use fallback IP)
    const res1 = await app.request('/')
    expect(res1.status).toBe(200)

    const res2 = await app.request('/')
    expect(res2.status).toBe(429)
  })
})

describe('loginRateLimiter preset', () => {
  it('allows 10 login attempts per 15 minutes', async () => {
    const app = new Hono()
    app.use('*', loginRateLimiter)
    app.post('/login', (c) => c.json({ ok: true }))

    const ip = { headers: { 'x-forwarded-for': '10.0.1.1' }, method: 'POST' }

    // First 10 succeed
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/login', { ...ip })
      expect(res.status).toBe(200)
    }

    // 11th fails
    const res11 = await app.request('/login', { ...ip })
    expect(res11.status).toBe(429)
  })
})

describe('aiRateLimiter preset', () => {
  it('allows 30 AI requests per minute', async () => {
    const app = new Hono()
    app.use('*', aiRateLimiter)
    app.post('/ai/test', (c) => c.json({ ok: true }))

    const ip = { headers: { 'x-forwarded-for': '10.0.1.2' }, method: 'POST' }

    // First 30 succeed
    for (let i = 0; i < 30; i++) {
      const res = await app.request('/ai/test', { ...ip })
      expect(res.status).toBe(200)
    }

    // 31st fails
    const res31 = await app.request('/ai/test', { ...ip })
    expect(res31.status).toBe(429)
  })
})
