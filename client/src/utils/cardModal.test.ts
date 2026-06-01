import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { TestCase } from '../types/testing'
import {
  PRIORITIES,
  PRIORITY_LABELS,
  fmtDate,
  fmtRelative,
  activityText,
  renderMarkdown,
  computeSummary,
} from './cardModal'

describe('cardModal utilities', () => {
  describe('PRIORITIES', () => {
    it('contains all four priority levels', () => {
      expect(PRIORITIES).toEqual(['p0', 'p1', 'p2', 'p3'])
    })
  })

  describe('PRIORITY_LABELS', () => {
    it('maps each priority to a human-readable label', () => {
      expect(PRIORITY_LABELS.p0).toBe('Critical')
      expect(PRIORITY_LABELS.p1).toBe('High')
      expect(PRIORITY_LABELS.p2).toBe('Medium')
      expect(PRIORITY_LABELS.p3).toBe('Low')
    })

    it('has labels for all priorities', () => {
      PRIORITIES.forEach(p => {
        expect(PRIORITY_LABELS[p]).toBeDefined()
      })
    })
  })

  describe('fmtDate', () => {
    it('returns formatted date string for ISO string with Z suffix', () => {
      const result = fmtDate('2024-01-15T14:30:00Z')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('handles ISO string without Z suffix', () => {
      const result = fmtDate('2024-01-15T14:30:00')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('fmtRelative', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns "just now" for times less than 60 seconds ago', () => {
      const now = new Date('2024-01-15T14:30:00Z')
      vi.setSystemTime(now)
      const then = new Date(now.getTime() - 30 * 1000)
      expect(fmtRelative(then.toISOString())).toBe('just now')
    })

    it('returns minutes ago for times less than 3600 seconds ago', () => {
      const now = new Date('2024-01-15T14:30:00Z')
      vi.setSystemTime(now)
      const then = new Date(now.getTime() - 90 * 1000) // 1.5 minutes ago
      expect(fmtRelative(then.toISOString())).toMatch(/\dm ago/)
    })

    it('returns hours ago for times less than 86400 seconds ago', () => {
      const now = new Date('2024-01-15T14:30:00Z')
      vi.setSystemTime(now)
      const then = new Date(now.getTime() - 2 * 3600 * 1000) // 2 hours ago
      expect(fmtRelative(then.toISOString())).toMatch(/\dh ago/)
    })

    it('returns days ago for times 86400+ seconds ago', () => {
      const now = new Date('2024-01-15T14:30:00Z')
      vi.setSystemTime(now)
      const then = new Date(now.getTime() - 3 * 86400 * 1000) // 3 days ago
      expect(fmtRelative(then.toISOString())).toMatch(/\dd ago/)
    })
  })

  describe('activityText', () => {
    it('returns "Card created" for create action', () => {
      expect(activityText('create', '{}')).toBe('Card created')
    })

    it('returns "Card moved between columns" for move action', () => {
      expect(activityText('move', '{}')).toBe('Card moved between columns')
    })

    it('includes author name in comment activity', () => {
      const result = activityText('comment', JSON.stringify({ author: 'Alice' }))
      expect(result).toBe('Alice added a comment')
    })

    it('uses "Someone" when comment has no author', () => {
      const result = activityText('comment', JSON.stringify({}))
      expect(result).toBe('Someone added a comment')
    })

    it('includes test run details', () => {
      const result = activityText(
        'test_run',
        JSON.stringify({ title: 'Login Test', status: 'passed', run_by: 'Bob' })
      )
      expect(result).toContain('Login Test')
      expect(result).toContain('passed')
      expect(result).toContain('Bob')
    })

    it('omits run_by when not present in test_run', () => {
      const result = activityText('test_run', JSON.stringify({ title: 'Test', status: 'failed' }))
      expect(result).toContain('Test')
      expect(result).toContain('failed')
      expect(result).not.toContain(' by ')
    })

    it('humanizes field names in update action', () => {
      const result = activityText('update', JSON.stringify({ story_points: 5, priority: 'p0' }))
      expect(result).toContain('story points')
      expect(result).toContain('priority')
    })

    it('returns raw action string when meta is invalid JSON', () => {
      expect(activityText('custom_action', 'invalid{json}')).toBe('custom_action')
    })
  })

  describe('renderMarkdown', () => {
    it('renders # heading as h1', () => {
      const result = renderMarkdown('# Main Title')
      expect(result).toContain('<h1')
      expect(result).toContain('Main Title')
    })

    it('renders ## heading as h2', () => {
      const result = renderMarkdown('## Section')
      expect(result).toContain('<h2')
      expect(result).toContain('Section')
    })

    it('renders ### heading as h3', () => {
      const result = renderMarkdown('### Subsection')
      expect(result).toContain('<h3')
      expect(result).toContain('Subsection')
    })

    it('renders - list items as ul/li', () => {
      const result = renderMarkdown('- Item 1\n- Item 2')
      expect(result).toContain('<ul')
      expect(result).toContain('<li')
      expect(result).toContain('Item 1')
      expect(result).toContain('Item 2')
    })

    it('renders **text** as bold', () => {
      const result = renderMarkdown('This is **bold** text')
      expect(result).toContain('<strong>bold</strong>')
    })

    it('renders *text* as italic', () => {
      const result = renderMarkdown('This is *italic* text')
      expect(result).toContain('<em>italic</em>')
    })

    it('renders `code` as inline code element', () => {
      const result = renderMarkdown('Use `const x = 5` here')
      expect(result).toContain('<code')
      expect(result).toContain('const x = 5')
    })

    it('escapes XSS attempt in HTML', () => {
      const result = renderMarkdown('This has <script>alert("xss")</script> tag')
      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('&lt;/script&gt;')
      expect(result).not.toContain('<script>')
    })
  })

  describe('computeSummary', () => {
    it('returns all zeros for empty test case array', () => {
      const result = computeSummary([])
      expect(result).toEqual({
        total: 0,
        passed: 0,
        failed: 0,
        untested: 0,
        blocked: 0,
        skipped: 0,
      })
    })

    it('counts all-passed test cases correctly', () => {
      const cases: TestCase[] = [
        {
          id: 1,
          suite_id: null,
          card_id: 1,
          project_id: 1,
          title: 'Test 1',
          description: null,
          status: 'passed',
          priority: 'high',
          test_type: 'manual',
          steps: null,
          preconditions: null,
          expected_result: null,
          assigned_to: null,
          position: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          suite_id: null,
          card_id: 1,
          project_id: 1,
          title: 'Test 2',
          description: null,
          status: 'passed',
          priority: 'high',
          test_type: 'manual',
          steps: null,
          preconditions: null,
          expected_result: null,
          assigned_to: null,
          position: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]
      const result = computeSummary(cases)
      expect(result).toEqual({
        total: 2,
        passed: 2,
        failed: 0,
        untested: 0,
        blocked: 0,
        skipped: 0,
      })
    })

    it('correctly counts mixed status test cases', () => {
      const cases: TestCase[] = [
        {
          id: 1,
          suite_id: null,
          card_id: 1,
          project_id: 1,
          title: 'Test 1',
          description: null,
          status: 'passed',
          priority: 'high',
          test_type: 'manual',
          steps: null,
          preconditions: null,
          expected_result: null,
          assigned_to: null,
          position: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          suite_id: null,
          card_id: 1,
          project_id: 1,
          title: 'Test 2',
          description: null,
          status: 'failed',
          priority: 'high',
          test_type: 'manual',
          steps: null,
          preconditions: null,
          expected_result: null,
          assigned_to: null,
          position: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 3,
          suite_id: null,
          card_id: 1,
          project_id: 1,
          title: 'Test 3',
          description: null,
          status: 'blocked',
          priority: 'high',
          test_type: 'manual',
          steps: null,
          preconditions: null,
          expected_result: null,
          assigned_to: null,
          position: 2,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 4,
          suite_id: null,
          card_id: 1,
          project_id: 1,
          title: 'Test 4',
          description: null,
          status: 'skipped',
          priority: 'high',
          test_type: 'manual',
          steps: null,
          preconditions: null,
          expected_result: null,
          assigned_to: null,
          position: 3,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 5,
          suite_id: null,
          card_id: 1,
          project_id: 1,
          title: 'Test 5',
          description: null,
          status: 'untested',
          priority: 'high',
          test_type: 'manual',
          steps: null,
          preconditions: null,
          expected_result: null,
          assigned_to: null,
          position: 4,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]
      const result = computeSummary(cases)
      expect(result).toEqual({
        total: 5,
        passed: 1,
        failed: 1,
        untested: 1,
        blocked: 1,
        skipped: 1,
      })
    })
  })
})
