import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok } from '../lib/response.js'

const presets = new Hono()

presets.get('/lane-presets', async (c) => {
  const rows = await db.all<{ id: number; name: string; lanes: string }>('SELECT * FROM lane_presets ORDER BY id')
  return ok(c, rows.map((r) => ({ ...r, lanes: JSON.parse(r.lanes) as string[] })))
})

export default presets
