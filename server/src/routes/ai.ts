import { Hono } from 'hono'
import { z } from 'zod'
import { ok, err, parseId, zodErr } from '../lib/response.js'
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

const ALLOWED_TYPES = ['epic', 'feature', 'story', 'task', 'project', 'sprint', 'calendar'] as const

const parseItemBodySchema = z.object({
  input: z.string().min(1).max(1000),
  context: z.object({
    projectId: z.number().optional(),
    epicId: z.number().optional(),
    laneId: z.number().optional(),
    allowedTypes: z.array(z.enum(ALLOWED_TYPES)).min(1).optional(),
  }).optional(),
})

ai.post('/ai/parse-item', async (c) => {
  const raw = await c.req.json().catch(() => null)
  if (!raw) return err(c, 'invalid body', 400)

  const parsed = parseItemBodySchema.safeParse(raw)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues))

  const { input, context } = parsed.data
  const allowedTypes = context?.allowedTypes ?? [...ALLOWED_TYPES]

  const typeDescriptions: Record<string, string> = {
    epic: '{"type":"epic","payload":{"title":"...","description":"...","priority":"low"|"medium"|"high"|"critical","assignee":null|"name"}}',
    feature: '{"type":"feature","payload":{"title":"...","description":"...","priority":"low"|"medium"|"high"|"critical","assignee":null|"name"}}',
    story: '{"type":"story","payload":{"title":"...","description":"...","priority":"low"|"medium"|"high"|"critical","assignee":null|"name","estimate":null|number}}',
    task: '{"type":"task","payload":{"title":"...","description":"...","assignee":null|"name"}}',
    project: '{"type":"project","payload":{"name":"...","description":"..."}}',
    sprint: '{"type":"sprint","payload":{"name":"...","goal":"...","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD"}}',
    calendar: '{"type":"calendar","payload":{"title":"...","description":"...","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD"}}',
  }
  const shapes = allowedTypes.map((t) => typeDescriptions[t]).join('\n')

  const systemPrompt = `You are a project management assistant. Parse the user's work item request and return ONLY valid JSON matching exactly one of these shapes:\n${shapes}\n{"type":"unknown","reason":"why ambiguous"}\nRules: priority defaults to "medium"; assignee is null if no person is mentioned; for dates use today's date as default if unspecified; if no explicit description is provided, infer a brief one from the title/context; use "unknown" only if genuinely ambiguous.`

  try {
    const provider = await getProvider()
    const response = await provider.complete(`Parse this work item: ${input}`, {
      systemPrompt,
      maxTokens: 512,
    })
    const match = response.match(/\{[\s\S]*\}/)
    if (!match) return err(c, 'AI returned unparseable response', 500)
    const result = JSON.parse(match[0])
    return ok(c, result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

ai.post('/ai/cards/:id/generate-test-cases', requireFeature('auto_test_case_generation_ai'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid card id', 400)

  const card = await db.get<CardRow>(
    'SELECT id, title, description FROM cards WHERE id = ?',
    id
  )
  if (!card) return err(c, 'card not found', 404)

  const systemPrompt = `You are a QA engineer. Generate manual test cases for the given user story.
Return ONLY a valid JSON array (no markdown, no explanation) with this exact structure:
[{ "title": string, "preconditions": string, "steps": [{ "step": string, "expected": string }], "expected_result": string, "priority": "critical"|"high"|"medium"|"low" }]
Generate 3-5 test cases covering the happy path, edge cases, and negative scenarios.`

  try {
    const provider = await getProvider()
    const prompt = [
      `Generate test cases for this user story:`,
      `Title: ${card.title}`,
      card.description ? `Description: ${card.description}` : '',
    ].filter(Boolean).join('\n')

    const response = await provider.complete(prompt, {
      systemPrompt,
      maxTokens: 1024,
    })

    const match = response.match(/\[[\s\S]*\]/)
    if (!match) return err(c, 'AI returned unparseable response', 500)
    const testCases = JSON.parse(match[0])
    return ok(c, { testCases })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

export default ai
