import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { api } from '../api'

// ─── Icons ────────────────────────────────────────────────────────────────────

function DashboardIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function BoardIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2" />
    </svg>
  )
}

function BacklogIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h7" />
    </svg>
  )
}

function SprintsIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function TestsIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  to?: string
  icon: React.ReactNode
  label: string
  expanded: boolean
  disabled?: boolean
  badge?: boolean
}

function NavItem({ to, icon, label, expanded, disabled, badge }: NavItemProps) {
  const wrappedIcon = badge ? (
    <div className="relative flex-shrink-0">
      {icon}
      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full ring-1 ring-slate-900" />
    </div>
  ) : icon

  const labelSpan = (
    <span
      className={`text-sm font-medium whitespace-nowrap transition-all duration-200 overflow-hidden ${
        expanded ? 'opacity-100 w-auto ml-3' : 'opacity-0 w-0 ml-0'
      }`}
    >
      {label}
    </span>
  )

  if (disabled || !to) {
    return (
      <div
        title={disabled && !expanded ? label : undefined}
        className="flex items-center px-[18px] py-2.5 mx-1 rounded-lg text-slate-500 cursor-not-allowed select-none"
      >
        {wrappedIcon}
        {labelSpan}
      </div>
    )
  }

  return (
    <NavLink
      to={to}
      title={!expanded ? label : undefined}
      className={({ isActive }) =>
        `flex items-center px-[18px] py-2.5 mx-1 rounded-lg transition-colors duration-150 ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        }`
      }
    >
      {wrappedIcon}
      {labelSpan}
    </NavLink>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { projectId } = useParams<{ projectId?: string }>()
  const [expanded, setExpanded] = useState(false)
  const [hasFailedTests, setHasFailedTests] = useState(false)

  useEffect(() => {
    if (!projectId) { setHasFailedTests(false); return }
    api.getProjectTestCases(parseInt(projectId, 10), { status: 'failed' })
      .then(cases => setHasFailedTests(cases.length > 0))
      .catch(() => setHasFailedTests(false))
  }, [projectId])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 bg-slate-900 flex flex-col py-3 transition-all duration-200 ease-in-out ${
          expanded ? 'w-52' : 'w-16'
        }`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo */}
        <div className="flex items-center px-[18px] py-2 mb-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2" />
            </svg>
          </div>
          <span
            className={`font-bold text-white text-sm whitespace-nowrap transition-all duration-200 overflow-hidden ${
              expanded ? 'opacity-100 w-auto ml-3' : 'opacity-0 w-0 ml-0'
            }`}
          >
            SlateFlow
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-0.5">
          <NavItem to="/dashboard" icon={<DashboardIcon />} label="Dashboard" expanded={expanded} />
          <NavItem
            to={projectId ? `/projects/${projectId}/board` : undefined}
            icon={<BoardIcon />}
            label="Board"
            expanded={expanded}
            disabled={!projectId}
          />
          <NavItem
            to={projectId ? `/projects/${projectId}/backlog` : undefined}
            icon={<BacklogIcon />}
            label="Backlog"
            expanded={expanded}
            disabled={!projectId}
          />
          <NavItem
            to={projectId ? `/projects/${projectId}/sprints` : undefined}
            icon={<SprintsIcon />}
            label="Sprints"
            expanded={expanded}
            disabled={!projectId}
          />
          <NavItem
            to={projectId ? `/projects/${projectId}/tests` : undefined}
            icon={<TestsIcon />}
            label="Tests"
            expanded={expanded}
            disabled={!projectId}
            badge={hasFailedTests}
          />
        </nav>

        {/* Bottom */}
        <div className="mt-auto pt-2 border-t border-slate-800">
          <NavItem icon={<SettingsIcon />} label="Settings" expanded={expanded} disabled />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
