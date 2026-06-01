import { useBoardStore } from '../store/boardStore'
import { useRetroStore } from '../store/retroStore'
import { useServerSentEvents } from './useServerSentEvents'
import type { Card, RetroItem } from '../types'

export function useBoardCardEvents(
  _projectId: number,
  onCardChange?: (card: Card, type: 'created' | 'updated' | 'moved' | 'deleted', cardId?: number) => void
) {
  const { updateCard, deleteCard, addCard } = useBoardStore()

  useServerSentEvents('card:created', (card: Card) => {
    if (card.swim_lane_id) {
      addCard(card)
      onCardChange?.(card, 'created')
    }
  })

  useServerSentEvents('card:updated', (card: Card) => {
    updateCard(card)
    onCardChange?.(card, 'updated')
  })

  useServerSentEvents('card:moved', (card: Card) => {
    updateCard(card)
    onCardChange?.(card, 'moved')
  })

  useServerSentEvents('card:deleted', (data: { id: number }) => {
    deleteCard(data.id)
    onCardChange?.(null as any, 'deleted', data.id)
  })
}

export function useRetrospectiveEvents() {
  const { addItem: addRetroItem, updateItem: updateRetroItem, removeItem: removeRetroItem } = useRetroStore()

  useServerSentEvents('retro:item:created', (item: RetroItem) => {
    addRetroItem(item)
  })

  useServerSentEvents('retro:item:updated', (item: RetroItem) => {
    updateRetroItem(item)
  })

  useServerSentEvents('retro:item:deleted', (data: { id: number }) => {
    removeRetroItem(data.id)
  })
}

// Legacy export for backwards compatibility; prefer the separated hooks
export function useBoardEvents(projectId: number) {
  useBoardCardEvents(projectId)
  useRetrospectiveEvents()
}
