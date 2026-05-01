import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import projects from './routes/projects.js'
import columns from './routes/columns.js'
import cards from './routes/cards.js'
import sprints from './routes/sprints.js'
import comments from './routes/comments.js'
import labels from './routes/labels.js'
import presets from './routes/presets.js'
import lanes from './routes/lanes.js'
import activity from './routes/activity.js'
import dashboard from './routes/dashboard.js'
import testcases from './routes/testcases.js'
import { testCaseOpenApi } from './lib/openapi.js'

// Ensure the DB is initialised (runs schema + seed on first boot)
import './db/index.js'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors({ origin: 'http://localhost:5173' }))

app.get('/api/health', (c) => c.json({ data: { status: 'ok', service: 'slateflow' }, error: null }))

app.route('/api', projects)
app.route('/api', columns)
app.route('/api', cards)
app.route('/api', sprints)
app.route('/api', comments)
app.route('/api', labels)
app.route('/api', presets)
app.route('/api', lanes)
app.route('/api', activity)
app.route('/api', dashboard)
app.route('/api', testcases)

app.get('/api/openapi.json', (c) => c.json(testCaseOpenApi))

// In production, serve the built React client and handle SPA routing
if (process.env.NODE_ENV === 'production' && !process.versions.bun) {
  const { serveStatic } = await import('@hono/node-server/serve-static')
  app.use('/*', serveStatic({ root: './client/dist' }))
  // SPA fallback — return index.html for paths that aren't static assets
  app.get('*', serveStatic({ path: 'index.html', root: './client/dist' }))
}

app.notFound((c) => c.json({ data: null, error: 'not found' }, 404))

const port = Number(process.env.PORT) || 3000

// Bun: export default { port, fetch } is picked up automatically
// Node.js / tsx: use @hono/node-server
if (!process.versions.bun) {
  const { serve } = await import('@hono/node-server')
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}`)
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Kill the old process and retry.`)
      process.exit(1)
    }
    throw err
  })
}

export default { port, fetch: app.fetch }
