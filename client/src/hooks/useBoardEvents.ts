import { useEffect } from 'react'
import { useBoardStore } from '../store/boardStore'
import type { Card } from '../types'

export function useBoardEvents(projectId: number) {
  const { updateCard, deleteCard, addCard } = useBoardStore()

  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true })

    es.addEventListener('card:created', (e: MessageEvent) => {
      const card = JSON.parse(e.data) as Card
      if (card.swim_lane_id) addCard(card)
    })

    es.addEventListener('card:updated', (e: MessageEvent) => {
      updateCard(JSON.parse(e.data) as Card)
    })

    es.addEventListener('card:moved', (e: MessageEvent) => {
      updateCard(JSON.parse(e.data) as Card)
    })

    es.addEventListener('card:deleted', (e: MessageEvent) => {
      const { id } = JSON.parse(e.data) as { id: number }
      deleteCard(id)
    })

    return () => es.close()
  }, [projectId, addCard, updateCard, deleteCard])
}
