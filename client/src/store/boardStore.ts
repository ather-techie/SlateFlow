import { create } from 'zustand'
import type { Card, Lane, TestCaseSummary } from '../types'

interface BoardState {
  lanes: Lane[]
  cards: Card[]
  testCaseSummary: Record<number, TestCaseSummary>
  moveCard: (cardId: number, laneId: number, position: number) => void
  addCard: (card: Card) => void
  updateCard: (card: Card) => void
  deleteCard: (id: number) => void
  setTestCaseSummary: (cardId: number, summary: TestCaseSummary) => void
}

export const useBoardStore = create<BoardState>(set => ({
  lanes: [],
  cards: [],
  testCaseSummary: {},
  moveCard: (cardId, laneId, position) =>
    set(state => ({
      cards: state.cards.map(c =>
        c.id === cardId ? { ...c, swim_lane_id: laneId, position } : c,
      ),
    })),
  addCard: card => set(state => ({ cards: [...state.cards, card] })),
  updateCard: card =>
    set(state => ({ cards: state.cards.map(c => (c.id === card.id ? card : c)) })),
  deleteCard: id => set(state => ({ cards: state.cards.filter(c => c.id !== id) })),
  setTestCaseSummary: (cardId, summary) =>
    set(state => ({ testCaseSummary: { ...state.testCaseSummary, [cardId]: summary } })),
}))
