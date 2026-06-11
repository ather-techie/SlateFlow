import { useEffect, useState } from 'react'
import { api, type AiDigest } from '../../api/index'

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

interface Props {
  projectId: number
  onClose: () => void
}

export default function StandupDigestPanel({ projectId, onClose }: Props) {
  const [digest, setDigest] = useState<AiDigest | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setDigest(null)
    api.ai
      .getStandupDigest(projectId)
      .then(d => { if (!cancelled) setDigest(d) })
      .catch(() => { /* axios interceptor toasts */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    try {
      setDigest(await api.ai.generateStandupDigest(projectId))
    } catch {
      // axios interceptor toasts
    } finally {
      setGenerating(false)
    }
  }

  const hasDigest = Boolean(digest?.digest)

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 max-w-full bg-white border-l border-slate-200 shadow-xl flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-800">Standup Digest</h2>
        <button
          onClick={onClose}
          aria-label="Close standup digest panel"
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-slate-400 animate-pulse">Loading digest…</p>
        ) : hasDigest ? (
          <div>
            <div className="whitespace-pre-wrap text-sm text-slate-700">{digest!.digest}</div>
            {digest!.generated_at && (
              <p className="text-xs text-slate-400 mt-3">
                Generated {new Date(digest!.generated_at).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-8">
            No digest yet. Click "Regenerate" to create one.
          </p>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200">
        <button
          onClick={handleGenerate}
          disabled={generating || loading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating && <Spinner />}
          {generating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>
    </div>
  )
}
