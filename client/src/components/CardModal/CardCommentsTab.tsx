import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { Card, Comment } from '../../types'
import { api, type CommentThreadSummary } from '../../api/index'
import { fmtRelative } from '../../utils/cardModal'
import { FeatureGate } from '../ui/FeatureGate'
import CommentSummaryCard from './CommentSummaryCard'

interface Props {
  card: Card
}

export default function CardCommentsTab({ card }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<CommentThreadSummary | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  useEffect(() => {
    api.comments.list(card.id)
      .then(setComments)
      .catch(() => toast.error('Failed to load comments'))
      .finally(() => setLoading(false))
  }, [card.id])

  async function handleAddComment() {
    if (!commentBody.trim() || submittingComment) return
    setSubmittingComment(true)
    try {
      const comment = await api.comments.create(card.id, { body: commentBody.trim() })
      setComments(prev => [comment, ...prev])
      setCommentBody('')
      toast.success('Comment added')
    } finally {
      setSubmittingComment(false)
    }
  }

  async function handleSummarize() {
    if (summarizing) return
    setSummarizing(true)
    try {
      setSummary(await api.ai.summarizeComments(card.id))
    } catch {
      // axios interceptor already toasts API errors
    } finally {
      setSummarizing(false)
    }
  }

  if (loading) return <div className="text-sm text-slate-400">Loading comments…</div>

  return (
    <div className="space-y-4">
      {/* AI thread summary (only offered for threads with 5+ comments) */}
      <FeatureGate flag="ai">
        <FeatureGate flag="ai_writing_assist">
          {comments.length >= 5 && (
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ✨ {summarizing ? 'Summarizing…' : 'Summarize thread'}
            </button>
          )}
          {summary && <CommentSummaryCard summary={summary} onDismiss={() => setSummary(null)} />}
        </FeatureGate>
      </FeatureGate>

      {/* Comment form */}
      <div className="space-y-2">
        <textarea
          value={commentBody}
          onChange={e => setCommentBody(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <button
          onClick={handleAddComment}
          disabled={submittingComment || !commentBody.trim()}
          className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submittingComment ? 'Posting…' : 'Post comment'}
        </button>
      </div>

      {/* Comments list */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No comments yet.</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="border border-slate-200 rounded-lg bg-slate-50 p-3">
              <div className="flex items-start justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">{c.author || 'Anonymous'}</span>
                <span className="text-xs text-slate-400">{fmtRelative(c.created_at)}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
