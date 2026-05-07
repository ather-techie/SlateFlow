import { Hono } from 'hono'
import { ok } from '../lib/response.js'
import { getAllFlags } from '../lib/featureFlags.js'

const config = new Hono()

config.get('/config', async (c) => {
  const features = await getAllFlags()
  return ok(c, { features })
})

export default config
