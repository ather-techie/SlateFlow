import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../api/index'
import { api as legacyApi } from '../../api'
import { useAuthStore } from '../../store/authStore'
import { COUNTRIES } from '../../constants/countries'
import type { CalendarEntryKind } from '../../types'

export type EntryFormKind = CalendarEntryKind

export interface EntryEditing {
  id: number
  kind: EntryFormKind
  title: string
  description: string | null
  start_date: string
  end_date: string
  color: string | null
  user_id?: number | null
  project_id?: number | null
  country?: string | null
  state_province?: string | null
}

interface Props {
  projectId: number
  initialDate?: string
  initialKind?: EntryFormKind
  editing?: EntryEditing | null
  /** Restrict the kind selector — e.g. AdminPage holiday tab passes `['holiday']`. */
  allowedKinds?: EntryFormKind[]
  /** When editing, callers can opt in to a Delete button. */
  canDelete?: boolean
  onClose: () => void
  onSaved: () => void
  onDeleted?: (id: number, kind: EntryFormKind) => void
}

interface UserOption {
  id: number
  display_name: string
  email: string
}

function todayISO() {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export default function EntryFormModal({ projectId, initialDate, initialKind, editing, allowedKinds, canDelete, onClose, onSaved, onDeleted }: Props) {
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin())
  const currentUser = useAuthStore(s => s.user)

  const baseKindOptions: EntryFormKind[] = isSuperAdmin
    ? ['event', 'vacation', 'holiday']
    : ['event', 'vacation']

  const kindOptions = (allowedKinds && allowedKinds.length > 0)
    ? allowedKinds.filter(k => baseKindOptions.includes(k))
    : baseKindOptions

  const [kind, setKind] = useState<EntryFormKind>(editing?.kind ?? initialKind ?? kindOptions[0] ?? 'event')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [startDate, setStartDate] = useState(editing?.start_date ?? initialDate ?? todayISO())
  const [endDate, setEndDate] = useState(editing?.end_date ?? initialDate ?? todayISO())
  const [color, setColor] = useState(editing?.color ?? '')
  const [country, setCountry] = useState(editing?.country ?? '')
  const [stateProvince, setStateProvince] = useState(editing?.state_province ?? '')
  const [userId, setUserId] = useState<number | null>(
    editing?.user_id ?? (kind === 'vacation' ? currentUser?.id ?? null : null),
  )
  const [users, setUsers] = useState<UserOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Load users list for vacation user-picker (admin only)
  useEffect(() => {
    if (kind !== 'vacation') return
    if (!isSuperAdmin) return
    legacyApi.users.list()
      .then(rows => setUsers(rows.map(u => ({ id: u.id, display_name: u.display_name, email: u.email }))))
      .catch(() => {})
  }, [kind, isSuperAdmin])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (startDate > endDate) {
      toast.error('End date must be on or after start date')
      return
    }
    setSubmitting(true)
    try {
      if (editing) {
        if (editing.kind === 'event') {
          const patch = {
            title: title.trim() || editing.title,
            description: description.trim() || null,
            start_date: startDate,
            end_date: endDate,
            color: color.trim() || null,
          }
          await api.calendar.events.update(editing.id, patch)
        } else if (editing.kind === 'vacation') {
          const patch = {
            title: title.trim() || editing.title,
            description: description.trim() || null,
            start_date: startDate,
            end_date: endDate,
            color: color.trim() || null,
          }
          await api.calendar.vacations.update(editing.id, patch)
        } else {
          const patch = {
            title: title.trim() || editing.title,
            description: description.trim() || null,
            start_date: startDate,
            end_date: endDate,
            color: color.trim() || null,
            country: country || null,
            state_province: stateProvince.trim() || null,
          }
          await api.calendar.holidays.update(editing.id, patch)
        }
        toast.success('Updated')
      } else if (kind === 'event') {
        await api.calendar.events.create(projectId, {
          title: title.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          color: color.trim() || null,
        })
        toast.success('Event created')
      } else if (kind === 'vacation') {
        await api.calendar.vacations.create({
          user_id: isSuperAdmin && userId ? userId : undefined,
          title: title.trim() || undefined,
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          color: color.trim() || null,
        })
        toast.success('Vacation added')
      } else {
        await api.calendar.holidays.create({
          title: title.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          color: color.trim() || null,
          country: country || null,
          state_province: stateProvince.trim() || null,
        })
        toast.success('Holiday added')
      }
      onSaved()
      onClose()
    } catch {
      // axios interceptor surfaces error
    } finally {
      setSubmitting(false)
    }
  }

  const requireTitle = kind !== 'vacation' || !!editing

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onMouseDown={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900 mb-5">
          {editing ? `Edit ${editing.kind}` : 'New calendar entry'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && kindOptions.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                Type
              </label>
              <select
                value={kind}
                onChange={e => setKind(e.target.value as EntryFormKind)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {kindOptions.includes('event') && <option value="event">Event</option>}
                {kindOptions.includes('vacation') && <option value="vacation">Vacation</option>}
                {kindOptions.includes('holiday') && <option value="holiday">Holiday (global)</option>}
              </select>
            </div>
          )}

          {!editing && kind === 'vacation' && isSuperAdmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                User
              </label>
              <select
                value={userId ?? currentUser?.id ?? ''}
                onChange={e => setUserId(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {users.length === 0 && currentUser && (
                  <option value={currentUser.id}>{currentUser.display_name} (you)</option>
                )}
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name} — {u.email}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              Title{requireTitle ? '' : ' (optional)'}
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required={requireTitle}
              autoFocus
              placeholder={kind === 'vacation' ? 'On vacation' : 'Demo day'}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">End</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              Color override (optional)
            </label>
            <input
              value={color}
              placeholder="#6366f1"
              onChange={e => setColor(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {(kind === 'holiday' || editing?.kind === 'holiday') && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Country (optional)
                </label>
                <select
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Global (no country) —</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {country && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                    State / Province (optional)
                  </label>
                  <input
                    value={stateProvince}
                    onChange={e => setStateProvince(e.target.value)}
                    placeholder="e.g. California"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-indigo-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Saving…' : editing ? 'Save' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          {editing && canDelete && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Delete this ${editing.kind}?`)) return
                try {
                  if (editing.kind === 'event') await api.calendar.events.delete(editing.id)
                  else if (editing.kind === 'vacation') await api.calendar.vacations.delete(editing.id)
                  else await api.calendar.holidays.delete(editing.id)
                  toast.success('Deleted')
                  onDeleted?.(editing.id, editing.kind)
                  onClose()
                } catch { /* toast handled */ }
              }}
              className="w-full text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg py-1.5 transition-colors"
            >
              Delete
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
