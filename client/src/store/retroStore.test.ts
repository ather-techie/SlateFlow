import { describe, it, expect, beforeEach } from 'vitest'
import { useRetroStore } from './retroStore'
import type { RetroItem } from '../types/retro'

function makeRetroItem(overrides: Partial<RetroItem> = {}): RetroItem {
  return {
    id: 1,
    retrospective_id: 1,
    category: 'went_well',
    body: 'Test item',
    position: 0,
    author_id: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useRetroStore', () => {
  beforeEach(() => {
    useRetroStore.setState({
      retroId: null,
      items: [],
    })
  })

  describe('setRetro', () => {
    it('sets retro id and items', () => {
      const items = [makeRetroItem({ id: 1 }), makeRetroItem({ id: 2 })]

      useRetroStore.getState().setRetro(1, items)

      const state = useRetroStore.getState()
      expect(state.retroId).toBe(1)
      expect(state.items).toEqual(items)
    })

    it('replaces previous retro and items', () => {
      const oldItems = [makeRetroItem({ id: 1, retrospective_id: 1 })]
      const newItems = [makeRetroItem({ id: 2, retrospective_id: 2 })]

      useRetroStore.getState().setRetro(1, oldItems)
      useRetroStore.getState().setRetro(2, newItems)

      const state = useRetroStore.getState()
      expect(state.retroId).toBe(2)
      expect(state.items).toEqual(newItems)
      expect(state.items[0].retrospective_id).toBe(2)
    })

    it('can set empty items array', () => {
      useRetroStore.getState().setRetro(1, [])

      const state = useRetroStore.getState()
      expect(state.retroId).toBe(1)
      expect(state.items).toEqual([])
    })
  })

  describe('addItem', () => {
    it('adds item when retro id matches', () => {
      useRetroStore.setState({ retroId: 1 })
      const item = makeRetroItem({ id: 1, retrospective_id: 1 })

      useRetroStore.getState().addItem(item)

      expect(useRetroStore.getState().items).toHaveLength(1)
      expect(useRetroStore.getState().items[0].id).toBe(1)
    })

    it('does not add item when retro id mismatches', () => {
      useRetroStore.setState({ retroId: 1 })
      const item = makeRetroItem({ id: 1, retrospective_id: 2 })

      useRetroStore.getState().addItem(item)

      expect(useRetroStore.getState().items).toHaveLength(0)
    })

    it('does not add duplicate item', () => {
      const item = makeRetroItem({ id: 1, retrospective_id: 1 })
      useRetroStore.setState({ retroId: 1, items: [item] })

      useRetroStore.getState().addItem(item)

      expect(useRetroStore.getState().items).toHaveLength(1)
    })

    it('appends item to existing items', () => {
      const item1 = makeRetroItem({ id: 1, retrospective_id: 1 })
      const item2 = makeRetroItem({ id: 2, retrospective_id: 1 })
      useRetroStore.setState({ retroId: 1, items: [item1] })

      useRetroStore.getState().addItem(item2)

      const items = useRetroStore.getState().items
      expect(items).toHaveLength(2)
      expect(items[1].id).toBe(2)
    })

    it('does not add when retro id is null', () => {
      const item = makeRetroItem({ id: 1, retrospective_id: 1 })
      useRetroStore.setState({ retroId: null })

      useRetroStore.getState().addItem(item)

      expect(useRetroStore.getState().items).toHaveLength(0)
    })
  })

  describe('updateItem', () => {
    it('updates existing item when retro id matches', () => {
      const item = makeRetroItem({ id: 1, retrospective_id: 1, body: 'Old text' })
      useRetroStore.setState({ retroId: 1, items: [item] })

      const updated = makeRetroItem({ id: 1, retrospective_id: 1, body: 'New text' })
      useRetroStore.getState().updateItem(updated)

      expect(useRetroStore.getState().items[0].body).toBe('New text')
    })

    it('adds new item if not found when retro id matches', () => {
      useRetroStore.setState({ retroId: 1, items: [] })
      const item = makeRetroItem({ id: 1, retrospective_id: 1 })

      useRetroStore.getState().updateItem(item)

      expect(useRetroStore.getState().items).toHaveLength(1)
      expect(useRetroStore.getState().items[0].id).toBe(1)
    })

    it('does not update when retro id mismatches', () => {
      const item = makeRetroItem({ id: 1, retrospective_id: 1, body: 'Original' })
      useRetroStore.setState({ retroId: 1, items: [item] })

      const updated = makeRetroItem({ id: 1, retrospective_id: 2, body: 'Updated' })
      useRetroStore.getState().updateItem(updated)

      expect(useRetroStore.getState().items[0].body).toBe('Original')
    })

    it('preserves other items when updating one', () => {
      const item1 = makeRetroItem({ id: 1, retrospective_id: 1, body: 'Item 1' })
      const item2 = makeRetroItem({ id: 2, retrospective_id: 1, body: 'Item 2' })
      useRetroStore.setState({ retroId: 1, items: [item1, item2] })

      const updated = makeRetroItem({ id: 1, retrospective_id: 1, body: 'Updated Item 1' })
      useRetroStore.getState().updateItem(updated)

      const items = useRetroStore.getState().items
      expect(items).toHaveLength(2)
      expect(items[0].body).toBe('Updated Item 1')
      expect(items[1].body).toBe('Item 2')
    })

    it('does not update when retro id is null', () => {
      const item = makeRetroItem({ id: 1, retrospective_id: 1, body: 'Original' })
      useRetroStore.setState({ retroId: null, items: [item] })

      const updated = makeRetroItem({ id: 1, retrospective_id: 1, body: 'Updated' })
      useRetroStore.getState().updateItem(updated)

      expect(useRetroStore.getState().items[0].body).toBe('Original')
    })
  })

  describe('removeItem', () => {
    it('removes item by id', () => {
      const item = makeRetroItem({ id: 1 })
      useRetroStore.setState({ items: [item] })

      useRetroStore.getState().removeItem(1)

      expect(useRetroStore.getState().items).toHaveLength(0)
    })

    it('preserves other items when removing one', () => {
      const item1 = makeRetroItem({ id: 1 })
      const item2 = makeRetroItem({ id: 2 })
      useRetroStore.setState({ items: [item1, item2] })

      useRetroStore.getState().removeItem(1)

      const items = useRetroStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(2)
    })

    it('does nothing for non-existent item', () => {
      const item = makeRetroItem({ id: 1 })
      useRetroStore.setState({ items: [item] })

      useRetroStore.getState().removeItem(999)

      expect(useRetroStore.getState().items).toHaveLength(1)
    })

    it('does not affect retro id', () => {
      const item = makeRetroItem({ id: 1 })
      useRetroStore.setState({ retroId: 5, items: [item] })

      useRetroStore.getState().removeItem(1)

      expect(useRetroStore.getState().retroId).toBe(5)
    })
  })

  describe('setItems', () => {
    it('replaces all items', () => {
      const oldItems = [makeRetroItem({ id: 1 })]
      const newItems = [
        makeRetroItem({ id: 2 }),
        makeRetroItem({ id: 3 }),
      ]
      useRetroStore.setState({ items: oldItems })

      useRetroStore.getState().setItems(newItems)

      const items = useRetroStore.getState().items
      expect(items).toHaveLength(2)
      expect(items.map(i => i.id)).toEqual([2, 3])
    })

    it('can set empty items array', () => {
      const item = makeRetroItem({ id: 1 })
      useRetroStore.setState({ items: [item] })

      useRetroStore.getState().setItems([])

      expect(useRetroStore.getState().items).toEqual([])
    })

    it('does not affect retro id', () => {
      useRetroStore.setState({ retroId: 5 })
      const items = [makeRetroItem({ id: 1 })]

      useRetroStore.getState().setItems(items)

      expect(useRetroStore.getState().retroId).toBe(5)
    })
  })

  describe('clear', () => {
    it('resets retro id and items', () => {
      const items = [makeRetroItem({ id: 1 }), makeRetroItem({ id: 2 })]
      useRetroStore.setState({ retroId: 1, items })

      useRetroStore.getState().clear()

      const state = useRetroStore.getState()
      expect(state.retroId).toBeNull()
      expect(state.items).toEqual([])
    })

    it('can be called when already cleared', () => {
      useRetroStore.setState({ retroId: null, items: [] })

      useRetroStore.getState().clear()

      const state = useRetroStore.getState()
      expect(state.retroId).toBeNull()
      expect(state.items).toEqual([])
    })
  })

  describe('initial state', () => {
    it('starts with no retro id', () => {
      expect(useRetroStore.getState().retroId).toBeNull()
    })

    it('starts with empty items', () => {
      expect(useRetroStore.getState().items).toEqual([])
    })
  })
})
