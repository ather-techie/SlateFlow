import type { TestCase, TestRun } from '../../types'

const STATUS_CFG = {
  untested: { icon: '○', color: 'text-slate-400' },
  passed:   { icon: '✓', color: 'text-green-600' },
  failed:   { icon: '✗', color: 'text-red-500' },
  blocked:  { icon: '⊘', color: 'text-amber-500' },
  skipped:  { icon: '—', color: 'text-slate-400' },
} as const

const TPRI_CFG: Record<string, { label: string; cls: string }> = {
  critical: { label: 'CRITICAL', cls: 'bg-red-100 text-red-700' },
  high:     { label: 'HIGH',     cls: 'bg-orange-100 text-orange-700' },
  medium:   { label: 'MEDIUM',   cls: 'bg-blue-100 text-blue-700' },
  low:      { label: 'LOW',      cls: 'bg-slate-100 text-slate-500' },
}

export function StatusIcon({ status }: { status: TestCase['status'] | TestRun['status'] }) {
  const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG]
  return <span className={`text-base font-bold w-5 flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
}

export function TPriBadge({ priority }: { priority: TestCase['priority'] }) {
  const cfg = TPRI_CFG[priority]
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">
      {type === 'automated' ? 'AUTO' : 'MANUAL'}
    </span>
  )
}

export { STATUS_CFG }
