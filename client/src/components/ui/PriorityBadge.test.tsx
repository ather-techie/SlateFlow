import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PriorityBadge, { cfg } from './PriorityBadge'
import type { Card } from '../../types/board'

describe('PriorityBadge', () => {
  describe('cfg data', () => {
    it('has all 4 priority keys', () => {
      expect(Object.keys(cfg)).toHaveLength(4)
      expect(cfg).toHaveProperty('p0')
      expect(cfg).toHaveProperty('p1')
      expect(cfg).toHaveProperty('p2')
      expect(cfg).toHaveProperty('p3')
    })

    it('p0 (Critical) has correct label and color', () => {
      expect(cfg.p0.label).toBe('Critical')
      expect(cfg.p0.cls).toContain('red')
    })

    it('p1 (High) has correct label and color', () => {
      expect(cfg.p1.label).toBe('High')
      expect(cfg.p1.cls).toContain('orange')
    })

    it('p2 (Medium) has correct label and color', () => {
      expect(cfg.p2.label).toBe('Medium')
      expect(cfg.p2.cls).toContain('blue')
    })

    it('p3 (Low) has correct label and color', () => {
      expect(cfg.p3.label).toBe('Low')
      expect(cfg.p3.cls).toContain('slate')
    })
  })

  describe('rendering', () => {
    const priorities: Card['priority'][] = ['p0', 'p1', 'p2', 'p3']

    priorities.forEach((priority) => {
      it(`renders correct label for ${priority}`, () => {
        render(<PriorityBadge priority={priority} />)
        expect(screen.getByText(cfg[priority].label)).toBeInTheDocument()
      })

      it(`has correct background class for ${priority}`, () => {
        const { container } = render(<PriorityBadge priority={priority} />)
        const span = container.querySelector('span')
        expect(span?.className).toContain(cfg[priority].cls)
      })
    })

    it('renders as a span element', () => {
      const { container } = render(<PriorityBadge priority="p2" />)
      const span = container.querySelector('span')
      expect(span).toBeInTheDocument()
    })
  })
})
