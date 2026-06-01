import type { Card } from '../../types'

interface Props {
  card: Card
  projectId: number
}

// TODO: Extract GitHub/GitLab link management (gated by github_integration + gitlab_integration flags)
// Should handle: display linked PRs/MRs, add new links by URL, remove links
// Uses: api.cardLinks.list, api.cardLinks.add, api.cardLinks.remove
export default function CardIntegrationsTab({ card, projectId }: Props) {
  return (
    <div className="text-sm text-slate-500 p-4 border border-slate-200 rounded-lg bg-slate-50">
      <p>🔗 Integrations tab</p>
      <p className="text-xs mt-2">Card ID: {card.id} | Project: {projectId}</p>
      <p className="text-xs text-slate-400 mt-4">
        TODO: Display linked GitHub PRs and GitLab MRs with add/remove UI<br />
        See CardModal.old.tsx lines ~1500-1550 for original implementation
      </p>
    </div>
  )
}
