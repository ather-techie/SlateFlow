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

export default function SprintDigestPanel({ sprintId }: { sprintId: number }) {
  const [digest, setDigest] = useState<AiDigest | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setDigest(null)
    api.ai
      .getSprintDigest(sprintId)
      .then(d => { if (!cancelled) setDigest(d) })
      .catch(() => { /* axios interceptor toasts */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sprintId])

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    try {
      setDigest(await api.ai.generateSprintDigest(sprintId))
    } catch {
      // axios interceptor toasts
    } finally {
      setGenerating(false)
    }
  }

  const hasDigest = Boolean(digest?.digest)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Sprint Digest</h2>
          <p className="text-xs text-slate-500 mt-0.5">AI-generated summary of sprint progress</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {generating && <Spinner />}
          {generating ? 'Generating…' : hasDigest ? 'Regenerate' : 'Generate digest'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 animate-pulse py-4">Loading digest…</p>
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
        <p className="text-sm text-slate-400 text-center py-6">
          No digest yet. Click "Generate digest" to create one.
        </p>
      )}
    </div>
  )
}
