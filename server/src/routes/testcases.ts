import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const testcases = new Hono()

// ── Schemas ───────────────────────────────────────────────────────────────────

const SuiteCreateSchema = z.object({
  name:        z.string().min(1, 'name is required').max(200),
  description: z.string().optional(),
})

const SuiteUpdateSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  description: z.string().optional(),
})

const StepSchema = z.object({ step: z.string(), expected: z.string() })

const TestCaseCreateSchema = z.object({
  title:           z.string().min(1, 'title is required'),
  description:     z.string().optional(),
  suite_id:        z.number().int().positive().optional(),
  priority:        z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  test_type:       z.enum(['manual', 'automated']).optional().default('manual'),
  steps:           z.array(StepSchema).optional(),
  preconditions:   z.string().optional(),
  expected_result: z.string().optional(),
  assigned_to:     z.string().optional(),
})

const TestCaseUpdateSchema = z.object({
  title:           z.string().min(1).optional(),
  description:     z.string().optional(),
  suite_id:        z.number().int().positive().nullable().optional(),
  status:          z.enum(['untested', 'passed', 'failed', 'blocked', 'skipped']).optional(),
  priority:        z.enum(['critical', 'high', 'medium', 'low']).optional(),
  test_type:       z.enum(['manual', 'automated']).optional(),
  steps:           z.array(StepSchema).nullable().optional(),
  preconditions:   z.string().optional(),
  expected_result: z.string().optional(),
  assigned_to:     z.string().optional(),
})

const TestRunCreateSchema = z.object({
  status: z.enum(['passed', 'failed', 'blocked', 'skipped']),
  notes:  z.string().optional(),
  run_by: z.string().optional(),
})

const ReorderSchema = z.object({
  ordered_ids: z.array(z.number().int().positive()).min(1),
})

const BulkStatusSchema = z.object({
  ids:    z.array(z.number().int().positive()).min(1),
  status: z.enum(['untested', 'passed', 'failed', 'blocked', 'skipped']),
})

// ── Types & helpers ───────────────────────────────────────────────────────────

type TestCaseRow = {
  id: number; suite_id: number | null; card_id: number; project_id: number
  title: string; description: string | null; status: string; priority: string
  test_type: string; steps: string | null; preconditions: string | null
  expected_result: string | null; assigned_to: string | null
  position: number; created_at: string; updated_at: string
}

type CardRef = { id: number; swim_lane_id: number | null; column_id: number | null }

function withParsedSteps(tc: TestCaseRow) {
  return { ...tc, steps: tc.steps ? JSON.parse(tc.steps) : null }
}

async function resolveProjectId(card: CardRef): Promise<number | null> {
  if (card.swim_lane_id) {
    const lane = await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', card.swim_lane_id)
    return lane?.project_id ?? null
  }
  if (card.column_id) {
    const col = await db.get<{ project_id: number }>('SELECT project_id FROM columns WHERE id = ?', card.column_id)
    return col?.project_id ?? null
  }
  return null
}

// ── Test Suites ───────────────────────────────────────────────────────────────

// GET /projects/:id/test-suites
testcases.get('/projects/:id/test-suites', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  return ok(c, await db.all('SELECT * FROM test_suites WHERE project_id = ? ORDER BY id', projectId))
})

// POST /projects/:id/test-suites
testcases.post('/projects/:id/test-suites', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = SuiteCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, description } = parsed.data
  const { lastID } = await db.run(
    'INSERT INTO test_suites (project_id, name, description) VALUES (?, ?, ?)',
    projectId, name, description ?? null,
  )

  return ok(c, await db.get('SELECT * FROM test_suites WHERE id = ?', lastID), 201)
})

// PATCH /test-suites/:id
testcases.patch('/test-suites/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const suite = await db.get('SELECT id FROM test_suites WHERE id = ?', id)
  if (!suite) return err(c, 'test suite not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = SuiteUpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const sets: string[] = []
  const vals: unknown[] = []
  if (parsed.data.name        !== undefined) { sets.push('name = ?');        vals.push(parsed.data.name) }
  if (parsed.data.description !== undefined) { sets.push('description = ?'); vals.push(parsed.data.description) }

  if (sets.length === 0) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE test_suites SET ${sets.join(', ')} WHERE id = ?`, ...vals)
  return ok(c, await db.get('SELECT * FROM test_suites WHERE id = ?', id))
})

// DELETE /test-suites/:id
testcases.delete('/test-suites/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const suite = await db.get('SELECT id FROM test_suites WHERE id = ?', id)
  if (!suite) return err(c, 'test suite not found', 404)

  await db.transaction(async () => {
    await db.run('UPDATE test_cases SET suite_id = NULL WHERE suite_id = ?', id)
    await db.run('DELETE FROM test_suites WHERE id = ?', id)
  })()

  return ok(c, { id })
})

// ── Test Cases ────────────────────────────────────────────────────────────────

// GET /cards/:id/test-cases
testcases.get('/cards/:id/test-cases', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', cardId)
  if (!card) return err(c, 'card not found', 404)

  type RowWithRun = TestCaseRow & {
    latest_run_id: number | null; latest_run_status: string | null
    latest_run_notes: string | null; latest_run_by: string | null; latest_run_at: string | null
  }

  const rows = await db.all<RowWithRun>(`
    SELECT tc.*,
      tr.id     as latest_run_id,     tr.status as latest_run_status,
      tr.notes  as latest_run_notes,  tr.run_by as latest_run_by,
      tr.run_at as latest_run_at
    FROM test_cases tc
    LEFT JOIN test_runs tr ON tr.id = (
      SELECT id FROM test_runs WHERE test_case_id = tc.id ORDER BY run_at DESC, id DESC LIMIT 1
    )
    WHERE tc.card_id = ?
    ORDER BY tc.position, tc.id
  `, cardId)

  const cases = rows.map(({ latest_run_id, latest_run_status, latest_run_notes, latest_run_by, latest_run_at, ...tc }) => ({
    ...withParsedSteps(tc as TestCaseRow),
    latest_run: latest_run_id
      ? { id: latest_run_id, status: latest_run_status, notes: latest_run_notes, run_by: latest_run_by, run_at: latest_run_at }
      : null,
  }))

  const summary = {
    total:    cases.length,
    passed:   cases.filter(r => r.status === 'passed').length,
    failed:   cases.filter(r => r.status === 'failed').length,
    untested: cases.filter(r => r.status === 'untested').length,
    blocked:  cases.filter(r => r.status === 'blocked').length,
    skipped:  cases.filter(r => r.status === 'skipped').length,
  }

  return ok(c, { cases, summary })
})

// POST /cards/:id/test-cases
testcases.post('/cards/:id/test-cases', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = await db.get<CardRef>('SELECT id, swim_lane_id, column_id FROM cards WHERE id = ?', cardId)
  if (!card) return err(c, 'card not found', 404)

  const projectId = await resolveProjectId(card)
  if (!projectId) return err(c, 'cannot determine project for card', 400)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = TestCaseCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, suite_id, priority, test_type, steps, preconditions, expected_result, assigned_to } = parsed.data

  if (suite_id) {
    const suite = await db.get('SELECT id FROM test_suites WHERE id = ? AND project_id = ?', suite_id, projectId)
    if (!suite) return err(c, 'test suite not found in this project', 404)
  }

  const maxPosRow = await db.get<{ m: number }>(
    'SELECT COALESCE(MAX(position), -1) as m FROM test_cases WHERE card_id = ?', cardId,
  )
  const maxPos = maxPosRow?.m ?? -1

  const { lastID } = await db.run(`
    INSERT INTO test_cases
      (suite_id, card_id, project_id, title, description, priority, test_type,
       steps, preconditions, expected_result, assigned_to, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    suite_id ?? null, cardId, projectId, title,
    description ?? null, priority, test_type,
    steps ? JSON.stringify(steps) : null,
    preconditions ?? null, expected_result ?? null, assigned_to ?? null, maxPos + 1,
  )

  const row = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', lastID)
  return ok(c, withParsedSteps(row!), 201)
})

// GET /test-cases/:id
testcases.get('/test-cases/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const tc = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', id)
  if (!tc) return err(c, 'test case not found', 404)

  const runs = await db.all('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY run_at DESC, id DESC', id)

  return ok(c, { ...withParsedSteps(tc), runs })
})

// PATCH /test-cases/:id
testcases.patch('/test-cases/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const tc = await db.get('SELECT id FROM test_cases WHERE id = ?', id)
  if (!tc) return err(c, 'test case not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = TestCaseUpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []
  const d = parsed.data

  if (d.title           !== undefined) { sets.push('title = ?');           vals.push(d.title) }
  if (d.description     !== undefined) { sets.push('description = ?');     vals.push(d.description) }
  if (d.suite_id        !== undefined) { sets.push('suite_id = ?');        vals.push(d.suite_id) }
  if (d.status          !== undefined) { sets.push('status = ?');          vals.push(d.status) }
  if (d.priority        !== undefined) { sets.push('priority = ?');        vals.push(d.priority) }
  if (d.test_type       !== undefined) { sets.push('test_type = ?');       vals.push(d.test_type) }
  if (d.steps           !== undefined) { sets.push('steps = ?');           vals.push(d.steps ? JSON.stringify(d.steps) : null) }
  if (d.preconditions   !== undefined) { sets.push('preconditions = ?');   vals.push(d.preconditions) }
  if (d.expected_result !== undefined) { sets.push('expected_result = ?'); vals.push(d.expected_result) }
  if (d.assigned_to     !== undefined) { sets.push('assigned_to = ?');     vals.push(d.assigned_to) }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE test_cases SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  const updated = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', id)
  return ok(c, withParsedSteps(updated!))
})

// DELETE /test-cases/:id
testcases.delete('/test-cases/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const tc = await db.get('SELECT id FROM test_cases WHERE id = ?', id)
  if (!tc) return err(c, 'test case not found', 404)

  await db.run('DELETE FROM test_cases WHERE id = ?', id)
  return ok(c, { id })
})

// POST /cards/:id/test-cases/reorder
testcases.post('/cards/:id/test-cases/reorder', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', cardId)
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { ordered_ids } = parsed.data

  const cardTcIds = new Set(
    (await db.all<{ id: number }>('SELECT id FROM test_cases WHERE card_id = ?', cardId)).map(r => r.id),
  )
  if (!ordered_ids.every(id => cardTcIds.has(id))) {
    return err(c, 'one or more test case ids do not belong to this card', 400)
  }

  await db.transaction(async () => {
    for (let idx = 0; idx < ordered_ids.length; idx++) {
      await db.run('UPDATE test_cases SET position = ? WHERE id = ?', idx, ordered_ids[idx])
    }
  })()

  const rows = await db.all<TestCaseRow>('SELECT * FROM test_cases WHERE card_id = ? ORDER BY position, id', cardId)
  return ok(c, rows.map(withParsedSteps))
})

// ── Test Runs ─────────────────────────────────────────────────────────────────

// POST /test-cases/:id/runs
testcases.post('/test-cases/:id/runs', async (c) => {
  const testCaseId = parseId(c.req.param('id'))
  if (!testCaseId) return err(c, 'invalid id', 400)

  const tc = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', testCaseId)
  if (!tc) return err(c, 'test case not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = TestRunCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { status, notes, run_by } = parsed.data

  const run = await db.transaction(async () => {
    const { lastID } = await db.run(`
      INSERT INTO test_runs (test_case_id, card_id, status, notes, run_by)
      VALUES (?, ?, ?, ?, ?)
    `, testCaseId, tc.card_id, status, notes ?? null, run_by ?? null)

    await db.run(
      "UPDATE test_cases SET status = ?, updated_at = datetime('now') WHERE id = ?",
      status, testCaseId,
    )

    await db.run(
      "INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'test_run', ?)",
      tc.card_id, JSON.stringify({ title: tc.title, status, run_by: run_by ?? null }),
    )

    return db.get('SELECT * FROM test_runs WHERE id = ?', lastID)
  })()

  return ok(c, run, 201)
})

// GET /test-cases/:id/runs
testcases.get('/test-cases/:id/runs', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const tc = await db.get('SELECT id FROM test_cases WHERE id = ?', id)
  if (!tc) return err(c, 'test case not found', 404)

  return ok(c, await db.all('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY run_at DESC, id DESC', id))
})

// ── Bulk Operations ───────────────────────────────────────────────────────────

// GET /projects/:id/test-cases
testcases.get('/projects/:id/test-cases', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const suiteId  = c.req.query('suite_id')
  const status   = c.req.query('status')
  const priority = c.req.query('priority')
  const testType = c.req.query('test_type')

  const conditions: string[] = ['tc.project_id = ?']
  const vals: unknown[] = [projectId]

  if (suiteId)  { conditions.push('tc.suite_id = ?');  vals.push(parseInt(suiteId, 10)) }
  if (status)   { conditions.push('tc.status = ?');    vals.push(status) }
  if (priority) { conditions.push('tc.priority = ?');  vals.push(priority) }
  if (testType) { conditions.push('tc.test_type = ?'); vals.push(testType) }

  type RowWithRunAndCard = TestCaseRow & {
    card_title: string | null
    latest_run_id: number | null; latest_run_status: string | null
    latest_run_notes: string | null; latest_run_by: string | null; latest_run_at: string | null
  }

  const rows = await db.all<RowWithRunAndCard>(
    `SELECT tc.*, c.title AS card_title,
      tr.id AS latest_run_id, tr.status AS latest_run_status,
      tr.notes AS latest_run_notes, tr.run_by AS latest_run_by, tr.run_at AS latest_run_at
     FROM test_cases tc
     LEFT JOIN cards c ON c.id = tc.card_id
     LEFT JOIN test_runs tr ON tr.id = (
       SELECT id FROM test_runs WHERE test_case_id = tc.id ORDER BY run_at DESC, id DESC LIMIT 1
     )
     WHERE ${conditions.join(' AND ')} ORDER BY tc.position, tc.id`,
    ...vals,
  )

  return ok(c, rows.map(({ latest_run_id, latest_run_status, latest_run_notes, latest_run_by, latest_run_at, ...tc }) => ({
    ...withParsedSteps(tc as TestCaseRow),
    card_title: (tc as unknown as { card_title: string | null }).card_title,
    latest_run: latest_run_id
      ? { id: latest_run_id, status: latest_run_status, notes: latest_run_notes, run_by: latest_run_by, run_at: latest_run_at }
      : null,
  })))
})

// PATCH /cards/:id/test-cases/bulk-status
testcases.patch('/cards/:id/test-cases/bulk-status', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', cardId)
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = BulkStatusSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { ids, status } = parsed.data

  const cardTcIds = new Set(
    (await db.all<{ id: number }>('SELECT id FROM test_cases WHERE card_id = ?', cardId)).map(r => r.id),
  )
  if (!ids.every(id => cardTcIds.has(id))) {
    return err(c, 'one or more test case ids do not belong to this card', 400)
  }

  await db.transaction(async () => {
    for (const id of ids) {
      await db.run("UPDATE test_cases SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id)
    }
  })()

  const rows = await db.all<TestCaseRow>('SELECT * FROM test_cases WHERE card_id = ? ORDER BY position, id', cardId)
  return ok(c, rows.map(withParsedSteps))
})

export default testcases
