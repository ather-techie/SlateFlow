import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eventBus, type BoardEvent } from '../lib/eventBus.js'

const sse = new Hono()

sse.get('/events', (c) => {
  const user = c.get('user')

  return streamSSE(c, async (stream) => {
    const keepalive = setInterval(() => {
      stream.writeSSE({ data: '', event: 'ping' }).catch(() => {})
    }, 25_000)

    const handler = async (event: BoardEvent) => {
      if (event.type === 'notification' && event.userId !== user.id) return
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
          id: String(Date.now()),
        })
      } catch { /* client disconnected */ }
    }

    eventBus.on('board', handler)

    await new Promise<void>(resolve => {
      c.req.raw.signal.addEventListener('abort', () => resolve())
    })

    clearInterval(keepalive)
    eventBus.off('board', handler)
  })
})

export default sse
