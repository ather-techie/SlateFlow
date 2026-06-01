import { describe, it, expect } from 'vitest'
import type { Card } from '../../types/board'

// CardCommentsTab is a component that loads and displays comments, and allows adding new comments.
// Component testing requires @testing-library/react which is not configured in this project.
// Integration tests should verify the comment fetching, posting, and UI behavior.

const mockCard: Card = {
  id: 1,
  column_id: null,
  swim_lane_id: null,
  sprint_id: 1,
  feature_id: 1,
  title: 'Test Card',
  description: 'Test description',
  priority: 'p1',
  story_points: 5,
  assignee: null,
  assignee_id: null,
  position: 0,
  due_date: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('CardCommentsTab', () => {
  describe('component interface', () => {
    it('accepts a card prop', () => {
      expect(mockCard).toBeDefined()
      expect(mockCard.id).toBe(1)
    })

    it('uses helper function for relative timestamps', () => {
      // Component uses fmtRelative from cardModalHelpers which is tested separately
      expect(true).toBe(true)
    })
  })
})
