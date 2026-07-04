import { Hono } from 'hono'
import { z } from 'zod'
import { ok, err, parseId } from '../../lib/response.js'
import { requireFeature } from '../../middleware/requireRole.js'
import { getProvider } from '../../lib/ai.js'
import { parseAiJson } from '../../lib/aiJson.js'
import { canReadFeatureEpic } from '../../lib/epicAccess.js'
import { db } from '../../db/index.js'
import { truncate } from '../../lib/aiContext.js'
import {
  GENERATE_ACCEPTANCE_CRITERIA_SYSTEM, GENERATE_ACCEPTANCE_CRITERIA_USER_TEMPLATE,
  SUMMARIZE_COMMENTS_SYSTEM, SUMMARIZE_COMMENTS_USER_TEMPLATE,
  interpolate,
} from '../../lib/prompts.js'

const writing = new Hono()

interface CardRow {
  id: number
  title: string
  description: string
  feature_id: number | null
  project_id: number | null
}

const CARD_ROW_QUERY = `
  SELECT c.id, c.title, c.description, c.feature_id, f.project_id
  FROM cards c LEFT JOIN features f ON f.id = c.feature_id
  WHERE c.id = ?
`

const criterionSchema = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
})

writing.post('/ai/cards/:id/generate-acceptance-criteria', requireFeature('ai_writing_assist'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid card id', 400)

  const card = await db.get<CardRow>(CARD_ROW_QUERY, id)
  if (!card) return err(c, 'card not found', 404)

  const user = c.get('user')
  if (!(await canReadFeatureEpic(user.id, card.feature_id, user.role))) {
    return err(c, 'forbidden', 403)
  }

  const prompt = interpolate(GENERATE_ACCEPTANCE_CRITERIA_USER_TEMPLATE, {
    title: card.title,
    description: card.description,
  })

  try {
    const provider = await getProvider()
    const response = await provider.complete(prompt, {
      systemPrompt: GENERATE_ACCEPTANCE_CRITERIA_SYSTEM,
      maxTokens: 1024,
      usageContext: { userId: user.id, projectId: card.project_id ?? undefined, endpoint: '/ai/cards/:id/generate-acceptance-criteria' },
    })

    const items = parseAiJson<unknown[]>(response, 'array')
    if (!items) return err(c, 'AI returned unparseable response', 500)

    const criteria = items
      .map((item) => criterionSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data)
    if (criteria.length === 0) return err(c, 'AI returned no valid acceptance criteria', 500)

    return ok(c, { criteria })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

const commentSummarySchema = z.object({
  summary: z.string().min(1),
  decisions: z.array(z.string()).catch([]),
  open_questions: z.array(z.string()).catch([]),
})

writing.post('/ai/cards/:id/summarize-comments', requireFeature('ai_writing_assist'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid card id', 400)

  const card = await db.get<CardRow>(CARD_ROW_QUERY, id)
  if (!card) return err(c, 'card not found', 404)

  const user = c.get('user')
  if (!(await canReadFeatureEpic(user.id, card.feature_id, user.role))) {
    return err(c, 'forbidden', 403)
  }

  // Most recent 50, presented oldest-first so the model follows the thread.
  const comments = await db.all<{ author: string; body: string; created_at: string }>(
    `SELECT author, body, created_at FROM (
       SELECT author, body, created_at, id FROM comments WHERE card_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 50
     ) ORDER BY created_at ASC, id ASC`,
    id,
  )
  if (comments.length < 5) return err(c, 'thread too short to summarize', 400)

  const commentsBlock = comments.map(cm =>
    `- ${cm.created_at} ${cm.author}: ${truncate(cm.body, 400)}`
  ).join('\n')

  const prompt = interpolate(SUMMARIZE_COMMENTS_USER_TEMPLATE, {
    title: card.title,
    comments_block: commentsBlock,
  })

  try {
    const provider = await getProvider()
    const response = await provider.complete(prompt, {
      systemPrompt: SUMMARIZE_COMMENTS_SYSTEM,
      maxTokens: 768,
      usageContext: { userId: user.id, projectId: card.project_id ?? undefined, endpoint: '/ai/cards/:id/summarize-comments' },
    })

    const json = parseAiJson<unknown>(response, 'object')
    if (!json) return err(c, 'AI returned unparseable response', 500)

    const parsed = commentSummarySchema.safeParse(json)
    if (!parsed.success) return err(c, 'AI returned an unexpected response shape', 500)

    return ok(c, parsed.data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

export default writing
