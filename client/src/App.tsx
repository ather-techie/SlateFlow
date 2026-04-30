import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api'
import BoardPage from './components/BoardPage'
import BacklogPage from './components/BacklogPage'
import SprintsPage from './components/SprintsPage'

function RootRedirect() {
  const [firstId, setFirstId] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    api
      .getProjects()
      .then(projects => setFirstId(projects[0]?.id ?? null))
      .catch(() => setFirstId(null))
      .finally(() => setChecked(true))
  }, [])

  if (!checked) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-slate-500 text-sm animate-pulse">Loading…</span>
      </div>
    )
  }
  if (firstId) return <Navigate to={`/projects/${firstId}`} replace />
  return (
    <div className="h-screen bg-slate-100 flex items-center justify-center">
      <p className="text-slate-500 text-sm">No projects found. Create one via the API.</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/projects/:projectId" element={<BoardPage />} />
        <Route path="/projects/:projectId/backlog" element={<BacklogPage />} />
        <Route path="/projects/:projectId/sprints" element={<SprintsPage />} />
      </Routes>
    </BrowserRouter>
  )
}
