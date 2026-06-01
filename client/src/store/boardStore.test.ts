import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from './boardStore'
import type { Card, TestCaseSummary } from '../types'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 1,
    column_id: null,
    swim_lane_id: 1,
    sprint_id: 1,
    feature_id: null,
    title: 'Test Card',
    description: 'Test Description',
    priority: 'p0',
    story_points: 5,
    assignee: 'John Doe',
    position: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useBoardStore', () => {
  beforeEach(() => {
    useBoardStore.setState({
      lanes: [],
      cards: [],
      testCaseSummary: {},
      taskSummary: {},
      linkCount: {},
    })
  })

  describe('moveCard', () => {
    it('moves card to new lane and position', () => {
      const card = makeCard({ id: 1, swim_lane_id: 1 })
      useBoardStore.setState({ cards: [card] })

      useBoardStore.getState().moveCard(1, 2, 5)

      const state = useBoardStore.getState()
      expect(state.cards[0].swim_lane_id).toBe(2)
      expect(state.cards[0].position).toBe(5)
    })

    it('updates position when moving within same lane', () => {
      const card = makeCard({ id: 1, position: 0 })
      useBoardStore.setState({ cards: [card] })

      useBoardStore.getState().moveCard(1, 1, 3)

      expect(useBoardStore.getState().cards[0].position).toBe(3)
    })

    it('preserves other card properties when moving', () => {
      const card = makeCard({ id: 1, title: 'My Task' })
      useBoardStore.setState({ cards: [card] })

      useBoardStore.getState().moveCard(1, 2, 0)

      const updated = useBoardStore.getState().cards[0]
      expect(updated.title).toBe('My Task')
      expect(updated.priority).toBe('p0')
    })

    it('does nothing for non-existent card', () => {
      const card = makeCard({ id: 1 })
      useBoardStore.setState({ cards: [card] })

      useBoardStore.getState().moveCard(999, 2, 0)

      expect(useBoardStore.getState().cards[0].swim_lane_id).toBe(1)
    })
  })

  describe('addCard', () => {
    it('adds card to empty state', () => {
      const card = makeCard({ id: 1 })
      useBoardStore.getState().addCard(card)

      const state = useBoardStore.getState()
      expect(state.cards).toHaveLength(1)
      expect(state.cards[0].id).toBe(1)
    })

    it('appends card to existing cards', () => {
      const card1 = makeCard({ id: 1 })
      const card2 = makeCard({ id: 2 })
      useBoardStore.setState({ cards: [card1] })

      useBoardStore.getState().addCard(card2)

      expect(useBoardStore.getState().cards).toHaveLength(2)
      expect(useBoardStore.getState().cards[1].id).toBe(2)
    })

    it('preserves order when adding multiple cards', () => {
      const card1 = makeCard({ id: 1 })
      const card2 = makeCard({ id: 2 })
      const card3 = makeCard({ id: 3 })

      useBoardStore.getState().addCard(card1)
      useBoardStore.getState().addCard(card2)
      useBoardStore.getState().addCard(card3)

      const cards = useBoardStore.getState().cards
      expect(cards.map(c => c.id)).toEqual([1, 2, 3])
    })
  })

  describe('updateCard', () => {
    it('updates card by id', () => {
      const card = makeCard({ id: 1, title: 'Old Title' })
      useBoardStore.setState({ cards: [card] })

      const updated = makeCard({ id: 1, title: 'New Title' })
      useBoardStore.getState().updateCard(updated)

      expect(useBoardStore.getState().cards[0].title).toBe('New Title')
    })

    it('preserves other cards when updating one', () => {
      const card1 = makeCard({ id: 1 })
      const card2 = makeCard({ id: 2 })
      useBoardStore.setState({ cards: [card1, card2] })

      const updated = makeCard({ id: 1, title: 'Updated' })
      useBoardStore.getState().updateCard(updated)

      const cards = useBoardStore.getState().cards
      expect(cards[0].title).toBe('Updated')
      expect(cards[1].title).toBe('Test Card')
    })

    it('does nothing for non-existent card', () => {
      const card = makeCard({ id: 1 })
      useBoardStore.setState({ cards: [card] })

      const nonExistent = makeCard({ id: 999, title: 'Ghost' })
      useBoardStore.getState().updateCard(nonExistent)

      expect(useBoardStore.getState().cards).toHaveLength(1)
      expect(useBoardStore.getState().cards[0].id).toBe(1)
    })
  })

  describe('deleteCard', () => {
    it('removes card by id', () => {
      const card = makeCard({ id: 1 })
      useBoardStore.setState({ cards: [card] })

      useBoardStore.getState().deleteCard(1)

      expect(useBoardStore.getState().cards).toHaveLength(0)
    })

    it('preserves other cards when deleting one', () => {
      const card1 = makeCard({ id: 1 })
      const card2 = makeCard({ id: 2 })
      useBoardStore.setState({ cards: [card1, card2] })

      useBoardStore.getState().deleteCard(1)

      const cards = useBoardStore.getState().cards
      expect(cards).toHaveLength(1)
      expect(cards[0].id).toBe(2)
    })

    it('does nothing for non-existent card', () => {
      const card = makeCard({ id: 1 })
      useBoardStore.setState({ cards: [card] })

      useBoardStore.getState().deleteCard(999)

      expect(useBoardStore.getState().cards).toHaveLength(1)
    })
  })

  describe('setTestCaseSummary', () => {
    it('sets test case summary for card', () => {
      const summary: TestCaseSummary = {
        total: 10,
        passed: 7,
        failed: 2,
        untested: 1,
        blocked: 0,
        skipped: 0,
      }

      useBoardStore.getState().setTestCaseSummary(1, summary)

      expect(useBoardStore.getState().testCaseSummary[1]).toEqual(summary)
    })

    it('updates existing test case summary', () => {
      const summary1: TestCaseSummary = {
        total: 5,
        passed: 3,
        failed: 1,
        untested: 1,
        blocked: 0,
        skipped: 0,
      }
      const summary2: TestCaseSummary = {
        total: 5,
        passed: 4,
        failed: 0,
        untested: 1,
        blocked: 0,
        skipped: 0,
      }

      useBoardStore.getState().setTestCaseSummary(1, summary1)
      useBoardStore.getState().setTestCaseSummary(1, summary2)

      expect(useBoardStore.getState().testCaseSummary[1]).toEqual(summary2)
    })

    it('preserves summaries for other cards', () => {
      const summary1: TestCaseSummary = {
        total: 5,
        passed: 3,
        failed: 1,
        untested: 1,
        blocked: 0,
        skipped: 0,
      }
      const summary2: TestCaseSummary = {
        total: 8,
        passed: 6,
        failed: 1,
        untested: 1,
        blocked: 0,
        skipped: 0,
      }

      useBoardStore.getState().setTestCaseSummary(1, summary1)
      useBoardStore.getState().setTestCaseSummary(2, summary2)

      const state = useBoardStore.getState()
      expect(state.testCaseSummary[1]).toEqual(summary1)
      expect(state.testCaseSummary[2]).toEqual(summary2)
    })
  })

  describe('setTaskSummary', () => {
    it('sets task summary for card', () => {
      const summary = { total: 5, done: 3 }
      useBoardStore.getState().setTaskSummary(1, summary)

      expect(useBoardStore.getState().taskSummary[1]).toEqual(summary)
    })

    it('updates existing task summary', () => {
      useBoardStore.getState().setTaskSummary(1, { total: 5, done: 2 })
      useBoardStore.getState().setTaskSummary(1, { total: 5, done: 5 })

      expect(useBoardStore.getState().taskSummary[1]).toEqual({ total: 5, done: 5 })
    })

    it('preserves summaries for other cards', () => {
      useBoardStore.getState().setTaskSummary(1, { total: 5, done: 2 })
      useBoardStore.getState().setTaskSummary(2, { total: 3, done: 1 })

      const state = useBoardStore.getState()
      expect(state.taskSummary[1]).toEqual({ total: 5, done: 2 })
      expect(state.taskSummary[2]).toEqual({ total: 3, done: 1 })
    })
  })

  describe('setLinkCount', () => {
    it('sets link count for card', () => {
      useBoardStore.getState().setLinkCount(1, 3)

      expect(useBoardStore.getState().linkCount[1]).toBe(3)
    })

    it('updates existing link count', () => {
      useBoardStore.getState().setLinkCount(1, 2)
      useBoardStore.getState().setLinkCount(1, 5)

      expect(useBoardStore.getState().linkCount[1]).toBe(5)
    })

    it('sets zero link count', () => {
      useBoardStore.getState().setLinkCount(1, 0)

      expect(useBoardStore.getState().linkCount[1]).toBe(0)
    })

    it('preserves link counts for other cards', () => {
      useBoardStore.getState().setLinkCount(1, 2)
      useBoardStore.getState().setLinkCount(2, 4)

      const state = useBoardStore.getState()
      expect(state.linkCount[1]).toBe(2)
      expect(state.linkCount[2]).toBe(4)
    })
  })
})
