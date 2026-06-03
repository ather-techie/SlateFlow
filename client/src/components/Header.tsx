import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/index'
import type { Project, Sprint } from '../types'

interface Props {
  project: Project
  sprints: Sprint[]
  selectedSprintId: number | null
  onSprintChange: (id: number | null) => void
}

function fmt(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Header({ project, sprints, selectedSprintId, onSprintChange }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => {})
  }, [])

  function getPageSlug() {
    if (location.pathname.endsWith('/backlog')) return 'backlog'
    if (location.pathname.endsWith('/sprints')) return 'sprints'
    if (location.pathname.endsWith('/epics')) return 'epics'
    if (location.pathname.endsWith('/retrospective')) return 'retrospective'
    if (location.pathname.endsWith('/calendar')) return 'calendar'
    return 'board'
  }

  function handleProjectChange(newId: number) {
    onSprintChange(null)
    navigate(`/projects/${newId}/${getPageSlug()}`)
  }

  const activeSprint = sprints.find(s => s.status === 'active')

  return (
    <header className="h-14 bg-slate-900 text-white flex items-center px-6 gap-4 flex-shrink-0 border-b border-slate-800">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="18" rx="1" />
          <rect x="14" y="3" width="7" height="11" rx="1" />
        </svg>
        <span className="font-semibold text-base tracking-tight">{project.name}</span>
      </div>

      <span className="text-slate-700 select-none">|</span>

      <nav className="flex items-center gap-5">
        {/* <NavLink to={`/projects/${projectId}/epics`} className={navClass}>
          Epics
        </NavLink>
        <NavLink to={`/projects/${projectId}/board`} end className={navClass}>
          Board
        </NavLink>
        <NavLink to={`/projects/${projectId}/backlog`} className={navClass}>
          Backlog
        </NavLink>
        <NavLink to={`/projects/${projectId}/sprints`} className={navClass}>
          Sprints
        </NavLink>
        <NavLink to={`/projects/${projectId}/tests`} className={navClass}>
          Tests
        </NavLink> */}
      </nav>

      {activeSprint && (
        <>
          <span className="text-slate-700 select-none">|</span>
          <span className="text-xs text-slate-400">
            <span className="text-emerald-400 font-medium">{activeSprint.name}</span>
            {activeSprint.start_date && activeSprint.end_date && (
              <span className="ml-1 text-slate-500">
                {fmt(activeSprint.start_date)} – {fmt(activeSprint.end_date)}
              </span>
            )}
          </span>
        </>
      )}

      {projects.length > 1 && (
        <>
          <span className="text-slate-700 select-none">|</span>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Project</span>
            <select
              value={project.id}
              onChange={e => handleProjectChange(Number(e.target.value))}
              className="bg-slate-800 text-slate-200 text-sm rounded-md px-2 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {sprints.length > 0 && (
        <>
          <span className="text-slate-700 select-none">|</span>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Sprint</span>
            <select
              value={selectedSprintId ?? ''}
              onChange={e => onSprintChange(e.target.value ? Number(e.target.value) : null)}
              className="bg-slate-800 text-slate-200 text-sm rounded-md px-2 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">All</option>
              {sprints.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === 'active' ? ' ●' : ''}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
        live
      </div>
    </header>
  )
}
