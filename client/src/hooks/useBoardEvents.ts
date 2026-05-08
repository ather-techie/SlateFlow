import { useEffect } from 'react'
import { useBoardStore } from '../store/boardStore'
import { useRetroStore } from '../store/retroStore'
import type { Card, RetroItem } from '../types'

export function useBoardEvents(projectId: number) {
  const { updateCard, deleteCard, addCard } = useBoardStore()
  const { addItem: addRetroItem, updateItem: updateRetroItem, removeItem: removeRetroItem } = useRetroStore()

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

    es.addEventListener('retro:item:created', (e: MessageEvent) => {
      addRetroItem(JSON.parse(e.data) as RetroItem)
    })
    es.addEventListener('retro:item:updated', (e: MessageEvent) => {
      updateRetroItem(JSON.parse(e.data) as RetroItem)
    })
    es.addEventListener('retro:item:deleted', (e: MessageEvent) => {
      const { id } = JSON.parse(e.data) as { id: number }
      removeRetroItem(id)
    })

    return () => es.close()
  }, [projectId, addCard, updateCard, deleteCard, addRetroItem, updateRetroItem, removeRetroItem])
}
