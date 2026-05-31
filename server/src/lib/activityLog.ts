import { db } from '../db/index.js'

export type ActivityAction = 'create' | 'field_changed' | 'move' | 'comment_added' | 'test_run'

export type ActivityMeta =
  | { swim_lane_id: number }
  | { field: string; from: unknown; to: unknown }
  | { from_lane_id: number | null; to_lane_id: number; position?: number; reason?: string }
  | { author: string }
  | { title: string; status: string; run_by: string | null }

export async function logActivity(
  cardId: number,
  action: ActivityAction,
  meta: ActivityMeta,
  userId?: number,
): Promise<void> {
  await db.run(
    'INSERT INTO activity_log (card_id, action, meta, user_id) VALUES (?, ?, ?, ?)',
    cardId, action, JSON.stringify(meta), userId ?? null,
  )
}
