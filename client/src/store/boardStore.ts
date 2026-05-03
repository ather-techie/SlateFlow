import { create } from 'zustand'
import type { Card, Lane, TestCaseSummary } from '../types'

export interface TaskSummary {
  total: number
  done: number
}

interface BoardState {
  lanes: Lane[]
  cards: Card[]
  testCaseSummary: Record<number, TestCaseSummary>
  taskSummary: Record<number, TaskSummary>
  moveCard: (cardId: number, laneId: number, position: number) => void
  addCard: (card: Card) => void
  updateCard: (card: Card) => void
  deleteCard: (id: number) => void
  setTestCaseSummary: (cardId: number, summary: TestCaseSummary) => void
  setTaskSummary: (cardId: number, summary: TaskSummary) => void
}

export const useBoardStore = create<BoardState>(set => ({
  lanes: [],
  cards: [],
  testCaseSummary: {},
  taskSummary: {},
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
  setTaskSummary: (cardId, summary) =>
    set(state => ({ taskSummary: { ...state.taskSummary, [cardId]: summary } })),
}))
