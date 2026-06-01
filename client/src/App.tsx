import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { api } from './api/index'
import { useAuthStore } from './store/authStore'
import { useFeatureFlagStore } from './store/featureFlagStore'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import BoardSkeleton from './components/ui/BoardSkeleton'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ProjectSetupPage from './pages/ProjectSetupPage'
import AdminPage from './pages/AdminPage'
import NotFoundPage from './pages/NotFoundPage'
import { FeatureGate } from './components/ui/FeatureGate'

// Lazy-loaded pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const BoardPage = lazy(() => import('./pages/BoardPage'))
const BacklogPage = lazy(() => import('./pages/BacklogPage'))
const SprintsPage = lazy(() => import('./pages/SprintsPage'))
const TestSuitePage = lazy(() => import('./pages/TestSuitePage'))
const EpicsPage = lazy(() => import('./pages/EpicsPage'))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const ProjectAdminPage = lazy(() => import('./pages/ProjectAdminPage'))
const RetrospectivePage = lazy(() => import('./pages/RetrospectivePage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))

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
  const { setUser } = useAuthStore()
  const { setFlags, setLoading: setFlagsLoading } = useFeatureFlagStore()

  // Hydrate auth state on mount
  useEffect(() => {
    api.auth
      .me()
      .then(user => setUser(user))
      .catch(() => setUser(null))
  }, [setUser])

  // Hydrate feature flags on mount (public endpoint, no auth required)
  useEffect(() => {
    fetch('/api/config', { credentials: 'include' })
      .then(r => r.json())
      .then(json => { if (json.data) setFlags(json.data.features) })
      .catch(() => setFlags({
        ai: false,
        auto_test_case_generation_ai: false,
        auto_story_generation_ai: false,
        retrospective: false,
        calendar: false,
        auth_password: true,
        auth_google: false,
        auth_github: false,
        github_integration: false,
        gitlab_integration: false,
        email_notifications: false,
        card_attachments: false,
        read_mcp: false,
        create_mcp: false,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
      }))
      .finally(() => setFlagsLoading(false))
  }, [setFlags, setFlagsLoading])

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: '#1e293b', color: '#f1f5f9', fontSize: '14px' },
          error: { style: { background: '#7f1d1d', color: '#fecaca' } },
        }}
      />
      <Suspense fallback={<BoardSkeleton />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected root redirect */}
          <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />

          {/* Protected project setup (outside Layout) */}
          <Route path="/projects/new" element={<ProtectedRoute><ProjectSetupPage /></ProtectedRoute>} />

          {/* Admin — super_admin only */}
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          } />

          {/* Protected app routes with Layout */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects/:projectId/epics" element={<EpicsPage />} />
            <Route path="/projects/:projectId/board" element={<BoardPage />} />
            <Route path="/projects/:projectId/backlog" element={<BacklogPage />} />
            <Route path="/projects/:projectId/sprints" element={<SprintsPage />} />
            <Route path="/projects/:projectId/tests" element={<TestSuitePage />} />
            <Route path="/projects/:projectId/roadmap" element={<RoadmapPage />} />
            <Route path="/projects/:projectId/reports" element={<ReportsPage />} />
            <Route path="/projects/:projectId/admin" element={<ProjectAdminPage />} />
            <Route
              path="/projects/:projectId/retrospective"
              element={<FeatureGate flag="retrospective" fallback={<NotFoundPage />}><RetrospectivePage /></FeatureGate>}
            />
            <Route
              path="/projects/:projectId/calendar"
              element={<FeatureGate flag="calendar" fallback={<NotFoundPage />}><CalendarPage /></FeatureGate>}
            />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
