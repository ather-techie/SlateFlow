import { db } from './../db/index.js'

/**
 * Shared report queries used by both the /reports routes and the AI routes
 * (digests, planning), so AI features reuse the same numbers the charts show
 * without HTTP self-calls.
 */

export interface SprintPointTotals {
  total_points: number
  completed_points: number
  total_stories: number
  completed_stories: number
}

export async function getSprintPointTotals(sprintId: number): Promise<SprintPointTotals> {
  const [totalPts, completedPts, totalStories, completedStories] = await Promise.all([
    db.get<{ pts: number }>(`SELECT COALESCE(SUM(story_points), 0) as pts FROM cards WHERE sprint_id = ?`, sprintId),
    db.get<{ pts: number }>(`SELECT COALESCE(SUM(c.story_points), 0) as pts
      FROM cards c JOIN swim_lanes sl ON sl.id = c.swim_lane_id
      WHERE c.sprint_id = ? AND sl.is_done_col = 1`, sprintId),
    db.get<{ n: number }>(`SELECT COUNT(*) as n FROM cards WHERE sprint_id = ?`, sprintId),
    db.get<{ n: number }>(`SELECT COUNT(*) as n FROM cards c
      JOIN swim_lanes sl ON sl.id = c.swim_lane_id
      WHERE c.sprint_id = ? AND sl.is_done_col = 1`, sprintId),
  ])

  return {
    total_points: totalPts?.pts ?? 0,
    completed_points: completedPts?.pts ?? 0,
    total_stories: totalStories?.n ?? 0,
    completed_stories: completedStories?.n ?? 0,
  }
}

export interface LaneCycleTime {
  lane_id: number
  lane_name: string
  avg_days: number | null
  sample_size: number
}

export async function getProjectCycleTime(projectId: number): Promise<LaneCycleTime[]> {
  const lanes = await db.all<{ id: number; name: string }>(
    'SELECT id, name FROM swim_lanes WHERE project_id = ? ORDER BY position',
    projectId,
  )

  if (lanes.length === 0) return []

  const [moves, creates] = await Promise.all([
    db.all<{ card_id: number; meta: string; created_at: string }>(
      `SELECT al.card_id, al.meta, al.created_at
       FROM activity_log al
       JOIN cards c ON c.id = al.card_id
       LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE al.action = 'move'
         AND (sl.project_id = ? OR c.swim_lane_id IS NULL)
         AND (
           SELECT sl2.project_id FROM swim_lanes sl2
           WHERE sl2.id = JSON_EXTRACT(al.meta, '$.to_lane_id')
         ) = ?
       ORDER BY al.card_id, al.created_at`,
      projectId, projectId,
    ),
    db.all<{ card_id: number; meta: string; created_at: string }>(
      `SELECT al.card_id, al.meta, al.created_at
       FROM activity_log al
       JOIN cards c ON c.id = al.card_id
       LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE al.action = 'create'
         AND JSON_EXTRACT(al.meta, '$.swim_lane_id') IS NOT NULL
         AND (
           SELECT sl2.project_id FROM swim_lanes sl2
           WHERE sl2.id = JSON_EXTRACT(al.meta, '$.swim_lane_id')
         ) = ?
       ORDER BY al.card_id, al.created_at`,
      projectId,
    ),
  ])

  const durationsByLane: Record<number, number[]> = {}
  const cardEvents: Record<number, { lane_id: number; entered_at: string }[]> = {}

  for (const ev of creates) {
    try {
      const meta = JSON.parse(ev.meta) as { swim_lane_id?: number }
      if (!meta.swim_lane_id) continue
      if (!cardEvents[ev.card_id]) cardEvents[ev.card_id] = []
      cardEvents[ev.card_id].push({ lane_id: meta.swim_lane_id, entered_at: ev.created_at })
    } catch { /* ignore malformed */ }
  }

  for (const mv of moves) {
    try {
      const meta = JSON.parse(mv.meta) as { to_lane_id?: number }
      if (!meta.to_lane_id) continue
      if (!cardEvents[mv.card_id]) cardEvents[mv.card_id] = []
      cardEvents[mv.card_id].push({ lane_id: meta.to_lane_id, entered_at: mv.created_at })
    } catch { /* ignore malformed */ }
  }

  for (const [, events] of Object.entries(cardEvents)) {
    events.sort((a, b) => a.entered_at.localeCompare(b.entered_at))
    for (let i = 0; i < events.length - 1; i++) {
      const laneId = events[i].lane_id
      const enterMs = new Date(events[i].entered_at.includes('Z') ? events[i].entered_at : events[i].entered_at + 'Z').getTime()
      const exitMs  = new Date(events[i + 1].entered_at.includes('Z') ? events[i + 1].entered_at : events[i + 1].entered_at + 'Z').getTime()
      const days = (exitMs - enterMs) / (1000 * 60 * 60 * 24)
      if (days >= 0) {
        if (!durationsByLane[laneId]) durationsByLane[laneId] = []
        durationsByLane[laneId].push(days)
      }
    }
  }

  return lanes.map(lane => {
    const durations = durationsByLane[lane.id] ?? []
    const avg_days = durations.length > 0
      ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10
      : null
    return { lane_id: lane.id, lane_name: lane.name, avg_days, sample_size: durations.length }
  })
}

export interface AssigneeCapacity {
  assignee: string
  story_count: number
  story_points: number
  capacity: number | null
  skills: string[]
}

export async function getSprintCapacity(projectId: number, sprintId: number): Promise<AssigneeCapacity[]> {
  const rows = await db.all<{ assignee: string; story_count: number; story_points: number; capacity: number | null; skills: string }>(
    `SELECT COALESCE(u.display_name, c.assignee, 'Unassigned') as assignee,
            COUNT(*) as story_count,
            COALESCE(SUM(c.story_points), 0) as story_points,
            pa.capacity,
            pa.skills
     FROM cards c
     LEFT JOIN users u ON u.id = c.assignee_id
     LEFT JOIN project_access pa ON pa.user_id = c.assignee_id AND pa.project_id = ?
     WHERE c.sprint_id = ?
     GROUP BY COALESCE(u.display_name, c.assignee, 'Unassigned'), pa.capacity, pa.skills
     ORDER BY story_points DESC, story_count DESC`,
    projectId, sprintId,
  )

  return rows.map(row => ({
    ...row,
    skills: (() => {
      try { return JSON.parse(row.skills ?? '[]') } catch { return [] }
    })(),
  }))
}

export interface DailyAiUsage {
  date: string
  input_tokens: number
  output_tokens: number
}

export async function getAiTokenUsage(projectId: number, days = 30): Promise<DailyAiUsage[]> {
  return db.all<DailyAiUsage>(
    `SELECT date(created_at) as date,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens
     FROM ai_usage
     WHERE project_id = ? AND created_at >= datetime('now', ?)
     GROUP BY date(created_at)
     ORDER BY date`,
    projectId, `-${days} days`,
  )
}
