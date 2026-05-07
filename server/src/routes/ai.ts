import { Hono } from 'hono'
import { ok, err, parseId } from '../lib/response.js'
import { requireFeature } from '../middleware/requireRole.js'
import { getProvider } from '../lib/ai.js'
import { db } from '../db/index.js'

const ai = new Hono()

ai.use('/ai/*', requireFeature('ai'))

interface CardRow {
  id: number
  title: string
  description: string
}

ai.post('/ai/cards/:id/summarize', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid card id', 400)

  const card = await db.get<CardRow>(
    'SELECT id, title, description FROM cards WHERE id = ?',
    id
  )
  if (!card) return err(c, 'card not found', 404)

  const prompt = [
    `Summarize the following story card in 2–3 sentences. Be concise and focus on what needs to be done.`,
    `Title: ${card.title}`,
    card.description ? `Description: ${card.description}` : '',
  ].filter(Boolean).join('\n')

  try {
    const provider = await getProvider()
    const summary = await provider.complete(prompt, {
      systemPrompt: 'You are a helpful project management assistant. Keep summaries brief and actionable.',
      maxTokens: 256,
    })
    return ok(c, { summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

export default ai
