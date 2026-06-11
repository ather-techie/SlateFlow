/**
 * POST + SSE-framed streaming consumption. The axios client buffers whole
 * responses, and EventSource is GET-only, so streaming endpoints (project
 * chat) go through this raw-fetch helper instead.
 */

export interface StreamCallbacks {
  onToken: (text: string) => void
  onError: (message: string) => void
  onDone: () => void
}

interface SSEFrame {
  event: string
  data: string
}

function parseFrame(block: string): SSEFrame | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

export async function postSSE(url: string, body: unknown, cb: StreamCallbacks, signal?: AbortSignal): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) return
    cb.onError(e instanceof Error ? e.message : 'network error')
    return
  }

  if (res.status === 401) {
    // Same session-expiry handling as the axios interceptor.
    const { useAuthStore } = await import('../store/authStore')
    useAuthStore.getState().logout()
    cb.onError('session expired')
    return
  }

  if (!res.ok) {
    let message = `request failed (${res.status})`
    try {
      const json = await res.json() as { error?: string }
      if (json.error) message = json.error
    } catch { /* non-JSON error body */ }
    cb.onError(message)
    return
  }

  if (!res.body) {
    cb.onError('response has no body')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  const handleFrame = (frame: SSEFrame) => {
    if (frame.event === 'token') {
      try {
        const { text } = JSON.parse(frame.data) as { text: string }
        if (typeof text === 'string') cb.onToken(text)
      } catch { /* skip malformed frame */ }
    } else if (frame.event === 'error') {
      finished = true
      try {
        const { message } = JSON.parse(frame.data) as { message: string }
        cb.onError(message || 'AI provider error')
      } catch {
        cb.onError('AI provider error')
      }
    } else if (frame.event === 'done') {
      finished = true
      cb.onDone()
    }
  }

  try {
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE frames are separated by a blank line.
      let idx: number
      while (!finished && (idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx).replace(/\r/g, '')
        buffer = buffer.slice(idx + 2)
        const frame = parseFrame(block)
        if (frame) handleFrame(frame)
      }
    }
    if (!finished) {
      // Stream ended without an explicit done/error event.
      cb.onDone()
    }
  } catch (e) {
    if (!finished && !signal?.aborted) {
      cb.onError(e instanceof Error ? e.message : 'stream interrupted')
    }
  } finally {
    reader.releaseLock()
  }
}
