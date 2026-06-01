import type { Card } from '../../types'

interface Props {
  card: Card
  projectId: number
}

// TODO: Extract dependency graph visualization and management
// Should handle: show blocks/blocked-by relationships, add/remove dependencies, search for target cards
// Uses: api.dependencies.list, api.dependencies.add, api.dependencies.remove, api.cards.searchStories
export default function CardDependenciesTab({ card, projectId }: Props) {
  return (
    <div className="text-sm text-slate-500 p-4 border border-slate-200 rounded-lg bg-slate-50">
      <p>🔗 Dependencies tab</p>
      <p className="text-xs mt-2">Card ID: {card.id} | Project: {projectId}</p>
      <p className="text-xs text-slate-400 mt-4">
        TODO: Display blocks/blocked-by relationships with add/remove UI<br />
        See CardModal.old.tsx lines ~1400-1500 for original implementation
      </p>
    </div>
  )
}
