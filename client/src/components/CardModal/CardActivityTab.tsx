import { useEffect, useState } from 'react'
import type { Card, ActivityLog } from '../../types'
import { api } from '../../api'
import { fmtRelative, activityText } from './cardModalHelpers'

interface Props {
  card: Card
}

export default function CardActivityTab({ card }: Props) {
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getActivityLog(card.id)
      .then(setActivity)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [card.id])

  if (loading) return <div className="text-sm text-slate-400">Loading activity…</div>
  if (activity.length === 0) return <p className="text-sm text-slate-400 italic">No activity yet.</p>

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {activity.map(log => (
        <div key={log.id} className="flex items-start gap-3 pb-2 border-b border-slate-100 last:border-b-0">
          <div className="flex-1">
            <p className="text-sm text-slate-700">{activityText(log.action, log.meta || '{}')}</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtRelative(log.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
