import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { Card, CardLink } from '../../types'
import { api } from '../../api/index'
import { useBoardStore } from '../../store/boardStore'
import { FeatureGate } from '../ui/FeatureGate'

interface Props {
  card: Card
  projectId: number
}

function LinkList({ links, onRemove }: { links: CardLink[]; onRemove: (id: number) => void }) {
  return (
    <ul className="space-y-1">
      {links.map(link => (
        <li key={link.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
          <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${link.state === 'merged' ? 'bg-violet-100 text-violet-700' : link.state === 'closed' ? 'bg-slate-200 text-slate-500' : 'bg-green-100 text-green-700'}`}>
            {link.state}
          </span>
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline flex-1 truncate">
            {link.title || link.url}
          </a>
          <button onClick={() => onRemove(link.id)} className="text-slate-300 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0" title="Remove">×</button>
        </li>
      ))}
    </ul>
  )
}

export default function CardIntegrationsTab({ card }: Props) {
  const setLinkCount = useBoardStore(s => s.setLinkCount)

  const [links, setLinks] = useState<CardLink[]>([])
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [addingLink, setAddingLink] = useState(false)

  useEffect(() => {
    api.cardLinks.list(card.id).then(ls => {
      setLinks(ls)
      setLinkCount(card.id, ls.length)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  async function handleAddLink() {
    if (!newLinkUrl.trim()) return
    try {
      const link = await api.cardLinks.add(card.id, { url: newLinkUrl.trim() })
      setLinks(ls => {
        const next = [link, ...ls]
        setLinkCount(card.id, next.length)
        return next
      })
      setNewLinkUrl('')
      setAddingLink(false)
      toast.success('Link added')
    } catch {
      toast.error('Failed to add link')
    }
  }

  async function handleRemoveLink(linkId: number) {
    try {
      await api.cardLinks.remove(card.id, linkId)
      setLinks(ls => {
        const next = ls.filter(l => l.id !== linkId)
        setLinkCount(card.id, next.length)
        return next
      })
      toast.success('Link removed')
    } catch {
      toast.error('Failed to remove link')
    }
  }

  const githubPrs = links.filter(l => l.provider === 'github' && l.type === 'pr')
  const githubIssues = links.filter(l => l.provider === 'github' && l.type === 'issue')
  const gitlabMrs = links.filter(l => l.provider === 'gitlab')

  return (
    <div className="space-y-5">
      <FeatureGate flag="github_integration">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Linked Pull Requests (GitHub)</p>
          {githubPrs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No GitHub PRs linked.</p>
          ) : (
            <LinkList links={githubPrs} onRemove={handleRemoveLink} />
          )}
        </div>
      </FeatureGate>

      <FeatureGate flag="github_integration">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Linked Issues (GitHub)</p>
          {githubIssues.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No GitHub issues linked.</p>
          ) : (
            <LinkList links={githubIssues} onRemove={handleRemoveLink} />
          )}
        </div>
      </FeatureGate>

      <FeatureGate flag="gitlab_integration">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Linked Merge Requests (GitLab)</p>
          {gitlabMrs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No GitLab MRs linked.</p>
          ) : (
            <LinkList links={gitlabMrs} onRemove={handleRemoveLink} />
          )}
        </div>
      </FeatureGate>

      {!addingLink ? (
        <button
          onClick={() => setAddingLink(true)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
        >
          + Link a PR / MR / Commit / Issue
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
          <input
            autoFocus
            value={newLinkUrl}
            onChange={e => setNewLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddLink(); if (e.key === 'Escape') setAddingLink(false) }}
            placeholder="Paste a GitHub PR, issue, commit or GitLab MR / commit URL…"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button onClick={handleAddLink} className="text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 transition-colors">
              Add
            </button>
            <button onClick={() => { setAddingLink(false); setNewLinkUrl('') }} className="text-xs text-slate-500 px-2">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
