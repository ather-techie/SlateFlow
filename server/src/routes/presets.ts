import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok } from '../lib/response.js'

const presets = new Hono()

presets.get('/lane-presets', (c) => {
  const rows = db.prepare('SELECT * FROM lane_presets ORDER BY id').all() as {
    id: number
    name: string
    lanes: string
  }[]
  return ok(c, rows.map((r) => ({ ...r, lanes: JSON.parse(r.lanes) as string[] })))
})

export default presets
