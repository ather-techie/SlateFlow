import type { Card } from '../types'

const cfg: Record<Card['priority'], { label: string; cls: string }> = {
  p0: { label: 'Critical', cls: 'bg-red-100 text-red-700 ring-red-200' },
  p1: { label: 'High', cls: 'bg-orange-100 text-orange-700 ring-orange-200' },
  p2: { label: 'Medium', cls: 'bg-blue-100 text-blue-700 ring-blue-200' },
  p3: { label: 'Low', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

export default function PriorityBadge({ priority }: { priority: Card['priority'] }) {
  const { label, cls } = cfg[priority]
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  )
}
