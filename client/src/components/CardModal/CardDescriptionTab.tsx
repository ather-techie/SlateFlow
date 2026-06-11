import type { Card } from '../../types'
import { api } from '../../api/index'
import { FeatureGate } from '../ui/FeatureGate'
import AcceptanceCriteriaGenerator from './AcceptanceCriteriaGenerator'

interface Props {
  card: Card
  onUpdate: (updated: Card) => void
}

// TODO: Extract description editor, task list management, and related UI from old CardModal
// Should handle: description editing (markdown), task CRUD, task status toggling
// Uses: api.updateCard, api.cards.createTask, api.cards.updateTask, api.cards.deleteTask, api.cards.reorderTasks
export default function CardDescriptionTab({ card, onUpdate }: Props) {
  // Save path for description edits — same PATCH the description editor will use.
  async function handleAppendToDescription(markdownBlock: string) {
    const updated = await api.cards.update(card.id, { description: (card.description ?? '') + markdownBlock })
    onUpdate(updated)
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-500 p-4 border border-slate-200 rounded-lg bg-slate-50">
        <p>📝 Description tab (extracted from old CardModal)</p>
        <p className="text-xs mt-2 whitespace-pre-wrap break-words">Current: {card.description || '(empty)'}</p>
        <p className="text-xs text-slate-400 mt-4">
          TODO: Implement markdown editor, task inline list, and related forms<br />
          See CardModal.old.tsx lines ~1100-1400 for original implementation
        </p>
      </div>

      <FeatureGate flag="ai">
        <FeatureGate flag="ai_writing_assist">
          <AcceptanceCriteriaGenerator cardId={card.id} onAppend={handleAppendToDescription} />
        </FeatureGate>
      </FeatureGate>
    </div>
  )
}
