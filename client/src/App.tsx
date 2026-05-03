import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { api } from './api/index'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import BoardPage from './pages/BoardPage'
import BacklogPage from './pages/BacklogPage'
import SprintsPage from './pages/SprintsPage'
import TestSuitePage from './pages/TestSuitePage'
import EpicsPage from './pages/EpicsPage'
import ProjectSetupPage from './pages/ProjectSetupPage'
import NotFoundPage from './pages/NotFoundPage'

function RootRedirect() {
  const [hasProjects, setHasProjects] = useState<boolean | null>(null)

  useEffect(() => {
    api.projects
      .list()
      .then(projects => setHasProjects(projects.length > 0))
      .catch(() => setHasProjects(false))
  }, [])

  if (hasProjects === null) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-slate-500 text-sm animate-pulse">Loading…</span>
      </div>
    )
  }
  if (hasProjects) return <Navigate to="/dashboard" replace />
  return <Navigate to="/projects/new" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: '#1e293b', color: '#f1f5f9', fontSize: '14px' },
          error: { style: { background: '#7f1d1d', color: '#fecaca' } },
        }}
      />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/projects/new" element={<ProjectSetupPage />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects/:projectId/epics" element={<EpicsPage />} />
          <Route path="/projects/:projectId/board" element={<BoardPage />} />
          <Route path="/projects/:projectId/backlog" element={<BacklogPage />} />
          <Route path="/projects/:projectId/sprints" element={<SprintsPage />} />
          <Route path="/projects/:projectId/tests" element={<TestSuitePage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
