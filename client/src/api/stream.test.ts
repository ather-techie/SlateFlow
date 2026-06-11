import { describe, it, expect, beforeEach, vi } from 'vitest'

const logout = vi.fn()
vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ logout }) },
}))

import { postSSE, type StreamCallbacks } from './stream'

function sseResponse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, init)
}

function makeCallbacks() {
  return {
    onToken: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
  } satisfies StreamCallbacks
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('postSSE', () => {
  it('parses token frames and the done frame', async () => {
    const cb = makeCallbacks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: token\ndata: {"text":"Hel"}\n\n',
      'event: token\ndata: {"text":"lo\\nthere"}\n\n',
      'event: done\ndata: {}\n\n',
    ])))

    await postSSE('/api/ai/projects/1/chat', { messages: [] }, cb)

    expect(cb.onToken).toHaveBeenNthCalledWith(1, 'Hel')
    expect(cb.onToken).toHaveBeenNthCalledWith(2, 'lo\nthere')
    expect(cb.onDone).toHaveBeenCalledTimes(1)
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('reassembles frames split across chunk boundaries', async () => {
    const cb = makeCallbacks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: tok',
      'en\ndata: {"te',
      'xt":"Hi"}\n',
      '\nevent: done\ndata: {}\n\n',
    ])))

    await postSSE('/x', {}, cb)

    expect(cb.onToken).toHaveBeenCalledWith('Hi')
    expect(cb.onDone).toHaveBeenCalledTimes(1)
  })

  it('surfaces error frames', async () => {
    const cb = makeCallbacks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: token\ndata: {"text":"partial"}\n\n',
      'event: error\ndata: {"message":"provider exploded"}\n\n',
    ])))

    await postSSE('/x', {}, cb)

    expect(cb.onToken).toHaveBeenCalledWith('partial')
    expect(cb.onError).toHaveBeenCalledWith('provider exploded')
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('calls onDone when the stream ends without an explicit done frame', async () => {
    const cb = makeCallbacks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: token\ndata: {"text":"hi"}\n\n',
    ])))

    await postSSE('/x', {}, cb)

    expect(cb.onDone).toHaveBeenCalledTimes(1)
  })

  it('logs out on 401', async () => {
    const cb = makeCallbacks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))

    await postSSE('/x', {}, cb)

    expect(logout).toHaveBeenCalled()
    expect(cb.onError).toHaveBeenCalledWith('session expired')
  })

  it('extracts the envelope error from non-OK JSON responses', async () => {
    const cb = makeCallbacks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null, error: 'not found' }), { status: 404 })
    ))

    await postSSE('/x', {}, cb)

    expect(cb.onError).toHaveBeenCalledWith('not found')
  })

  it('reports network failures', async () => {
    const cb = makeCallbacks()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    await postSSE('/x', {}, cb)

    expect(cb.onError).toHaveBeenCalledWith('connection refused')
  })
})
