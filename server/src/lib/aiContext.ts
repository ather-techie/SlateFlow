import { db } from './../db/index.js'

/**
 * Small data assemblers shared by the AI routes (digests, planning, chat).
 * Each returns plain rows; date math happens here in SQL/TS — never in the
 * model prompt.
 */

export function truncate(s: string | null | undefined, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '…' : s
}

export interface StalledCard {
  id: number
  title: string
  assignee: string | null
  lane_name: string
  idle_days: number
}

/** Cards in non-done lanes whose last activity (or creation) is older than staleDays. */
export async function getStalledCards(projectId: number, sprintId: number | null, staleDays: number): Promise<StalledCard[]> {
  const sprintFilter = sprintId ? 'AND c.sprint_id = ?' : ''
  const params: unknown[] = sprintId ? [projectId, sprintId, staleDays] : [projectId, staleDays]
  return db.all<StalledCard>(
    `SELECT c.id, c.title,
            COALESCE(u.display_name, c.assignee) as assignee,
            sl.name as lane_name,
            CAST(julianday('now') - julianday(COALESCE(MAX(al.created_at), c.created_at)) AS INTEGER) as idle_days
     FROM cards c
     JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN users u ON u.id = c.assignee_id
     LEFT JOIN activity_log al ON al.card_id = c.id
     WHERE sl.project_id = ? AND sl.is_done_col = 0 ${sprintFilter}
     GROUP BY c.id
     HAVING julianday('now') - julianday(COALESCE(MAX(al.created_at), c.created_at)) >= ?
     ORDER BY idle_days DESC
     LIMIT 30`,
    ...params,
  )
}

export interface BacklogCard {
  id: number
  title: string
  description: string
  priority: string
  story_points: number | null
  created_at: string
  last_activity_days: number
}

/** Backlog = cards with no sprint, scoped to the project (same source as GET /projects/:id/backlog). */
export async function getBacklogCards(projectId: number, limit: number): Promise<BacklogCard[]> {
  const rows = await db.all<BacklogCard>(
    `SELECT c.id, c.title, c.description, c.priority, c.story_points, c.created_at,
            CAST(julianday('now') - julianday(COALESCE(MAX(al.created_at), c.created_at)) AS INTEGER) as last_activity_days
     FROM cards c
     LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN columns col ON col.id = c.column_id
     LEFT JOIN activity_log al ON al.card_id = c.id
     WHERE c.sprint_id IS NULL AND (sl.project_id = ? OR col.project_id = ?)
     GROUP BY c.id
     ORDER BY CASE c.priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 ELSE 3 END, c.position, c.id
     LIMIT ?`,
    projectId, projectId, limit,
  )
  return rows.map(r => ({ ...r, description: truncate(r.description, 200) }))
}

export interface ProjectMember {
  user_id: number
  display_name: string
  role: string
  skills: string[]
  capacity: number | null
}

export async function getProjectMembers(projectId: number): Promise<ProjectMember[]> {
  const rows = await db.all<{ user_id: number; display_name: string; role: string; skills: string; capacity: number | null }>(
    `SELECT pa.user_id, u.display_name, pa.role, pa.skills, pa.capacity
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.project_id = ? AND u.is_active = 1 AND u.deleted_at IS NULL
     ORDER BY u.display_name`,
    projectId,
  )
  return rows.map(row => ({
    ...row,
    skills: (() => {
      try { return JSON.parse(row.skills ?? '[]') } catch { return [] }
    })(),
  }))
}

export interface VacationEntry {
  user_id: number | null
  display_name: string | null
  title: string
  start_date: string
  end_date: string
}

/** Vacations overlapping [from, to] (ISO dates), with the owner's display name. */
export async function getVacationsInRange(from: string, to: string): Promise<VacationEntry[]> {
  return db.all<VacationEntry>(
    `SELECT ce.user_id, u.display_name, ce.title, ce.start_date, ce.end_date
     FROM calendar_entries ce
     LEFT JOIN users u ON u.id = ce.user_id
     WHERE ce.kind = 'vacation' AND ce.start_date <= ? AND ce.end_date >= ?
     ORDER BY ce.start_date`,
    to, from,
  )
}
