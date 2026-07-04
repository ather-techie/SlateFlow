import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { err, parseId, zodErr } from '../../lib/response.js'
import { requireFeature } from '../../middleware/requireRole.js'
import { getProvider, type Message } from '../../lib/ai.js'
import { db } from '../../db/index.js'
import { buildProjectChatContext } from '../../lib/projectChatContext.js'
import { PROJECT_CHAT_SYSTEM_TEMPLATE, interpolate } from '../../lib/prompts.js'

const chat = new Hono()

// Roles are restricted to user/assistant — the server owns the system prompt;
// accepting a client-supplied system message would be a prompt-injection hole.
const chatBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(20),
})

const HISTORY_LIMIT = 12

/**
 * Streaming response — deliberately NOT the { data, error } envelope.
 * Emits SSE events: `token` ({"text": "..."}), `done`, `error` ({"message": "..."}).
 */
chat.post('/ai/projects/:id/chat', requireFeature('ai_project_chat'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid project id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', id)
  if (!project) return err(c, 'project not found', 404)

  const raw = await c.req.json().catch(() => null)
  if (!raw) return err(c, 'invalid body', 400)
  const parsed = chatBodySchema.safeParse(raw)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const history = parsed.data.messages.slice(-HISTORY_LIMIT)
  if (history[history.length - 1].role !== 'user') {
    return err(c, 'last message must be from the user', 422)
  }

  const user = c.get('user')
  const context = await buildProjectChatContext(user.id, user.role, id)
  if (context === null) return err(c, 'project not found', 404)

  const systemPrompt = interpolate(PROJECT_CHAT_SYSTEM_TEMPLATE, {
    today: new Date().toISOString().slice(0, 10),
    context,
  })

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history,
  ]

  return streamSSE(c, async (stream) => {
    try {
      const provider = await getProvider()
      const usageContext = { userId: user.id, projectId: id, endpoint: '/ai/projects/:id/chat' }
      for await (const text of provider.stream(messages, { maxTokens: 1024, usageContext })) {
        if (c.req.raw.signal.aborted) return
        // JSON-encode so newlines survive SSE framing.
        await stream.writeSSE({ event: 'token', data: JSON.stringify({ text }) })
      }
      await stream.writeSSE({ event: 'done', data: '{}' })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'AI provider error'
      try {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message }) })
      } catch { /* client disconnected */ }
    }
  })
})

export default chat
