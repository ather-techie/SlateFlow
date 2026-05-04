import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../api'
import { useAuthStore } from '../store/authStore'

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

function EpicsIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
  onClick?: () => void
}

function NavItem({ to, icon, label, expanded, disabled, badge, onClick }: NavItemProps) {
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

  if (onClick) {
    return (
      <button
        onClick={onClick}
        title={!expanded ? label : undefined}
        className="w-full flex items-center px-[18px] py-2.5 mx-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors duration-150"
      >
        {wrappedIcon}
        {labelSpan}
      </button>
    )
  }

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

// ─── User menu button ─────────────────────────────────────────────────────────

interface UserMenuProps {
  expanded: boolean
  onLogout: () => void
}

function UserMenu({ expanded, onLogout }: UserMenuProps) {
  const { user, isSuperAdmin } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!user) return null

  const initials = user.display_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div ref={ref} className="relative mx-1">
      <button
        onClick={() => setOpen(o => !o)}
        title={!expanded ? user.display_name : undefined}
        className="w-full flex items-center px-[18px] py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors duration-150"
      >
        <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-bold text-white">{initials}</span>
        </div>
        <span className={`text-sm font-medium whitespace-nowrap transition-all duration-200 overflow-hidden ${expanded ? 'opacity-100 w-auto ml-3' : 'opacity-0 w-0 ml-0'}`}>
          {user.display_name}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-2 mb-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-slate-700">
            <p className="text-xs font-medium text-slate-200 truncate">{user.display_name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
              {user.role === 'super_admin' ? 'Super Admin' : 'Member'}
            </span>
          </div>
          {isSuperAdmin() && (
            <button
              onClick={() => { setOpen(false); navigate('/admin') }}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
            >
              <AdminIcon />
              Admin Panel
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onLogout() }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { projectId } = useParams<{ projectId?: string }>()
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [expanded, setExpanded] = useState(false)
  const [hasFailedTests, setHasFailedTests] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!projectId) { setHasFailedTests(false); return }
    api.getProjectTestCases(parseInt(projectId, 10), { status: 'failed' })
      .then(cases => setHasFailedTests(cases.length > 0))
      .catch(() => setHasFailedTests(false))
  }, [projectId])

  useEffect(() => {
    api.notifications.list(true)
      .then(items => setUnreadCount(items.length))
      .catch(() => {})
  }, [])

  // SSE — update unread count on incoming notification events
  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true })
    es.addEventListener('notification', () => {
      setUnreadCount(n => n + 1)
    })
    return () => es.close()
  }, [])

  async function handleLogout() {
    try { await api.auth.logout() } catch { /* ignore */ }
    logout()
    navigate('/login')
    toast.success('Signed out')
  }

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
            to={projectId ? `/projects/${projectId}/epics` : undefined}
            icon={<EpicsIcon />}
            label="Epics"
            expanded={expanded}
            disabled={!projectId}
          />
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

        {/* Bottom — notifications + user menu */}
        <div className="mt-auto pt-2 border-t border-slate-800 flex flex-col gap-0.5">
          <NavItem
            icon={<BellIcon />}
            label="Notifications"
            expanded={expanded}
            badge={unreadCount > 0}
            onClick={() => {
              api.notifications.markAllRead().catch(() => {})
              setUnreadCount(0)
              toast.success('All notifications marked as read')
            }}
          />
          <UserMenu expanded={expanded} onLogout={handleLogout} />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
