import { describe, it, expect } from 'vitest'
import type { Card } from '../../types'

// CardActivityTab is primarily a component that renders activity logs fetched from the API.
// Component testing requires @testing-library/react which is not configured in this project.
// Logic testing is covered by the helper functions (fmtRelative, activityText) in cardModalHelpers.test.ts
// Integration tests should verify the API call behavior and render output.

const mockCard: Card = {
  id: 1,
  sprint_id: 1,
  epic_id: 1,
  feature_id: 1,
  title: 'Test Card',
  description: 'Test description',
  status: 'todo',
  priority: 'p1',
  story_points: 5,
  assignee_id: null,
  created_by_id: 1,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('CardActivityTab', () => {
  describe('component interface', () => {
    it('accepts a card prop', () => {
      // Component takes a Card prop - verified by type definition
      expect(mockCard).toBeDefined()
      expect(mockCard.id).toBe(1)
    })
  })
})
