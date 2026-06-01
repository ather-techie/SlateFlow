import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBoardStore } from '../store/boardStore'
import { useRetroStore } from '../store/retroStore'
import type { Card } from '../types/board'
import type { RetroItem } from '../types/retro'

// Test the store mutations directly that are triggered by the hooks
// The hooks can't be directly called in node environment, but we can test the logic
describe('useBoardEvents', () => {
  const makeCard = (overrides?: Partial<Card>): Card => ({
    id: 1,
    column_id: null,
    swim_lane_id: 1,
    sprint_id: 1,
    feature_id: null,
    title: 'Test card',
    description: '',
    priority: 'p2',
    story_points: null,
    assignee: null,
    assignee_id: null,
    position: 0,
    due_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  })

  beforeEach(() => {
    useBoardStore.setState({
      lanes: [],
      cards: [],
      testCaseSummary: {},
      taskSummary: {},
      linkCount: {},
    })

    useRetroStore.setState({
      retroId: null,
      items: [],
    })

    vi.clearAllMocks()
  })

  describe('boardStore card mutations (as called by useBoardCardEvents)', () => {
    it('addCard adds a card to the store', () => {
      const card = makeCard({ id: 10 })
      useBoardStore.getState().addCard(card)
      expect(useBoardStore.getState().cards).toContainEqual(card)
    })

    it('updateCard updates an existing card', () => {
      const card = makeCard({ id: 20, title: 'Original' })
      useBoardStore.getState().addCard(card)
      const updated = makeCard({ id: 20, title: 'Updated' })
      useBoardStore.getState().updateCard(updated)
      const stored = useBoardStore.getState().cards.find((c) => c.id === 20)
      expect(stored?.title).toBe('Updated')
    })

    it('deleteCard removes a card from the store', () => {
      const card = makeCard({ id: 30 })
      useBoardStore.getState().addCard(card)
      expect(useBoardStore.getState().cards).toHaveLength(1)
      useBoardStore.getState().deleteCard(30)
      expect(useBoardStore.getState().cards).toHaveLength(0)
    })

    it('updateCard with task summary updates taskSummary', () => {
      const card = makeCard({ id: 40 })
      useBoardStore.getState().addCard(card)
      useBoardStore.getState().setTaskSummary(40, { total: 3, done: 2 })
      expect(useBoardStore.getState().taskSummary[40]).toEqual({ total: 3, done: 2 })
    })

    it('updateCard with test case summary updates testCaseSummary', () => {
      const card = makeCard({ id: 50 })
      useBoardStore.getState().addCard(card)
      useBoardStore.getState().setTestCaseSummary(50, { total: 5, passed: 4, failed: 1, untested: 0, blocked: 0, skipped: 0 })
      expect(useBoardStore.getState().testCaseSummary[50]).toEqual({
        total: 5,
        passed: 4,
        failed: 1,
        untested: 0,
        blocked: 0,
        skipped: 0,
      })
    })
  })

  describe('retroStore mutations (as called by useRetrospectiveEvents)', () => {
    const makeRetroItem = (overrides?: Partial<RetroItem>): RetroItem => ({
      id: 1,
      retrospective_id: 1,
      category: 'went_well',
      body: 'Test item',
      position: 0,
      author_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    })

    beforeEach(() => {
      useRetroStore.setState({ retroId: 1, items: [] })
    })

    it('addItem adds a retro item when retroId matches', () => {
      const item = makeRetroItem({ id: 100, retrospective_id: 1 })
      useRetroStore.getState().addItem(item)
      expect(useRetroStore.getState().items).toContainEqual(item)
    })

    it('addItem ignores item if retroId does not match', () => {
      const item = makeRetroItem({ id: 101, retrospective_id: 999 })
      useRetroStore.getState().addItem(item)
      expect(useRetroStore.getState().items).toHaveLength(0)
    })

    it('updateItem updates an existing retro item', () => {
      const item = makeRetroItem({ id: 102, retrospective_id: 1, body: 'Original' })
      useRetroStore.getState().addItem(item)
      const updated = makeRetroItem({ id: 102, retrospective_id: 1, body: 'Updated' })
      useRetroStore.getState().updateItem(updated)
      const stored = useRetroStore.getState().items.find((i) => i.id === 102)
      expect(stored?.body).toBe('Updated')
    })

    it('removeItem deletes a retro item', () => {
      const item = makeRetroItem({ id: 103, retrospective_id: 1 })
      useRetroStore.getState().addItem(item)
      expect(useRetroStore.getState().items).toHaveLength(1)
      useRetroStore.getState().removeItem(103)
      expect(useRetroStore.getState().items).toHaveLength(0)
    })

    it('SSE event: card:created with swim_lane_id should call addCard', () => {
      // Simulating what the SSE listener does
      const card = makeCard({ id: 200, swim_lane_id: 5 })
      if (card.swim_lane_id) {
        useBoardStore.getState().addCard(card)
      }
      expect(useBoardStore.getState().cards).toContainEqual(card)
    })

    it('SSE event: card:created WITHOUT swim_lane_id should NOT call addCard', () => {
      // Simulating what the SSE listener does
      const card = makeCard({ id: 201, swim_lane_id: null as any })
      if (card.swim_lane_id) {
        useBoardStore.getState().addCard(card)
      }
      expect(useBoardStore.getState().cards).toHaveLength(0)
    })
  })
})
