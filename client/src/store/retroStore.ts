import { create } from 'zustand'
import type { RetroItem } from '../types'

interface RetroState {
  retroId: number | null
  items: RetroItem[]
  setRetro: (retroId: number, items: RetroItem[]) => void
  addItem: (item: RetroItem) => void
  updateItem: (item: RetroItem) => void
  removeItem: (id: number) => void
  setItems: (items: RetroItem[]) => void
  clear: () => void
}

export const useRetroStore = create<RetroState>(set => ({
  retroId: null,
  items: [],
  setRetro: (retroId, items) => set({ retroId, items }),
  addItem: item =>
    set(state => {
      if (state.retroId !== item.retrospective_id) return state
      if (state.items.some(i => i.id === item.id)) return state
      return { items: [...state.items, item] }
    }),
  updateItem: item =>
    set(state => {
      if (state.retroId !== item.retrospective_id) return state
      if (!state.items.some(i => i.id === item.id)) {
        return { items: [...state.items, item] }
      }
      return { items: state.items.map(i => (i.id === item.id ? item : i)) }
    }),
  removeItem: id =>
    set(state => ({ items: state.items.filter(i => i.id !== id) })),
  setItems: items => set({ items }),
  clear: () => set({ retroId: null, items: [] }),
}))
