export interface UpdateResult {
  sql: string
  params: unknown[]
}

/**
 * Builds the SET clause and params array for a dynamic UPDATE statement.
 * Returns null if no updatable fields are present in the input.
 *
 * Usage:
 *   const upd = buildUpdate(fields, ['title', 'description', 'priority'])
 *   if (!upd) return err(c, 'no fields to update', 400)
 *   upd.params.push(id)
 *   await db.run(`UPDATE cards SET ${upd.sql} WHERE id = ?`, ...upd.params)
 */
export function buildUpdate(
  fields: Record<string, unknown>,
  allowed: readonly string[],
  options: { withTimestamp?: boolean } = { withTimestamp: true },
): UpdateResult | null {
  const sets: string[] = []
  const params: unknown[] = []

  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`)
      params.push(fields[key] ?? null)
    }
  }

  if (sets.length === 0) return null

  if (options.withTimestamp ?? true) {
    sets.push("updated_at = datetime('now')")
  }

  return { sql: sets.join(', '), params }
}
