import { db } from '../db/index.js'

export async function resolveDefaultFeature(projectId: number): Promise<number | null> {
  const row = await db.get<{ id: number }>(
    'SELECT id FROM features WHERE project_id = ? AND is_default = 1 LIMIT 1',
    projectId,
  )
  return row?.id ?? null
}

export async function resolveDefaultSprint(projectId: number): Promise<number | null> {
  const row = await db.get<{ id: number }>(
    'SELECT id FROM sprints WHERE project_id = ? AND is_default = 1 LIMIT 1',
    projectId,
  )
  return row?.id ?? null
}

export async function resolveDefaultEpic(projectId: number): Promise<number | null> {
  const row = await db.get<{ id: number }>(
    'SELECT id FROM epics WHERE project_id = ? AND is_default = 1 LIMIT 1',
    projectId,
  )
  return row?.id ?? null
}

/**
 * Seeds the three default entities (Epic, Feature, Sprint) for a newly-created project.
 * Called from projects.ts and db/index.ts backfill — the two places that create projects.
 */
export async function seedProjectDefaults(projectId: number): Promise<void> {
  const { lastID: epicId } = await db.run(
    `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
     VALUES (?, 'Default Epic', '', 'p2', 'active', 1, 0)`,
    projectId,
  )
  await db.run(
    `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
     VALUES (?, ?, 'Default Feature', '', 'p2', 'active', 1, 0)`,
    projectId, epicId,
  )
  await db.run(
    `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
     VALUES (?, 'Default Sprint', '', date('now'), date('now', '+365 days'), 'planned', 1)`,
    projectId,
  )
}
