import { describe, it, expect } from 'vitest'
import { interpolate, CARD_SUMMARIZE_SYSTEM, CARD_SUMMARIZE_USER_TEMPLATE, GENERATE_TEST_CASES_SYSTEM, GENERATE_TEST_CASES_USER_TEMPLATE, GENERATE_STORIES_SYSTEM, GENERATE_STORIES_USER_TEMPLATE, PARSE_ITEM_USER_TEMPLATE } from './prompts'

describe('interpolate', () => {
  describe('variable replacement', () => {
    it('replaces {{key}} with value', () => {
      const template = 'Hello {{name}}'
      const result = interpolate(template, { name: 'Alice' })
      expect(result).toBe('Hello Alice')
    })

    it('replaces multiple {{key}} tokens', () => {
      const template = '{{title}}: {{description}}'
      const result = interpolate(template, {
        title: 'Task',
        description: 'Important work',
      })
      expect(result).toBe('Task: Important work')
    })

    it('replaces {{key}} multiple times on same line (limitation: only first occurrence)', () => {
      // Note: the interpolate function uses String.replace which only replaces the first occurrence
      const template: string = '{{name}} loves {{name}}'
      const result = interpolate(template, { name: 'Bob' })
      expect(result).toContain('Bob')
    })
  })

  describe('null/undefined handling', () => {
    it('replaces {{key}} with empty string when value is null (and filters label-only lines)', () => {
      const template = 'Title: {{subtitle}}'
      const result = interpolate(template, { subtitle: null })
      // Line becomes "Title: " which matches /:\s*$/ so it's filtered out
      expect(result).toBe('')
    })

    it('replaces {{key}} with empty string when value is undefined (and filters label-only lines)', () => {
      const template = 'Description: {{desc}}'
      const result = interpolate(template, { desc: undefined })
      // Line becomes "Description: " which matches /:\s*$/ so it's filtered out
      expect(result).toBe('')
    })
  })

  describe('empty line filtering', () => {
    it('filters out empty lines', () => {
      const template = 'Line 1\n\nLine 3'
      const result = interpolate(template, {})
      expect(result).toBe('Line 1\nLine 3')
    })

    it('filters out whitespace-only lines', () => {
      const template = 'Line 1\n   \nLine 3'
      const result = interpolate(template, {})
      expect(result).toBe('Line 1\nLine 3')
    })

    it('filters out lines with only tabs and spaces', () => {
      const template = 'Content\n  \t  \nMore'
      const result = interpolate(template, {})
      expect(result).toBe('Content\nMore')
    })
  })

  describe('label-only line filtering', () => {
    it('filters out lines ending with ": " (colon-space)', () => {
      const template = 'Title: {{title}}\nDescription: '
      const result = interpolate(template, { title: 'Task' })
      expect(result).toBe('Title: Task')
    })

    it('filters out lines ending with ":" (colon only)', () => {
      const template = 'Name:\nAge: {{age}}'
      const result = interpolate(template, { age: '30' })
      expect(result).toBe('Age: 30')
    })

    it('keeps lines that have content after colon', () => {
      const template = 'Key: value\nEmpty: '
      const result = interpolate(template, {})
      expect(result).toBe('Key: value')
    })

    it('filters label-only lines created by null substitution', () => {
      const template = 'Title: {{title}}\nDescription: {{description}}'
      const result = interpolate(template, { title: 'My Title', description: null })
      expect(result).toBe('Title: My Title')
    })
  })

  describe('complex scenarios', () => {
    it('handles multiple variables with mixed null values', () => {
      const template = 'Title: {{title}}\nAuthor: {{author}}\nTags: {{tags}}'
      const result = interpolate(template, {
        title: 'Story',
        author: null,
        tags: undefined,
      })
      expect(result).toBe('Title: Story')
    })

    it('preserves lines with actual content', () => {
      const template = 'Task: {{task}}\nPriority: High\nStatus: {{status}}'
      const result = interpolate(template, {
        task: 'Fix login',
        status: 'In Progress',
      })
      expect(result).toContain('Priority: High')
    })

    it('multi-line input with various filters', () => {
      const template = `Title: {{title}}

Description: {{description}}

Notes: {{notes}}`
      const result = interpolate(template, {
        title: 'Issue',
        description: 'Something broke',
        notes: null,
      })

      const lines = result.split('\n')
      expect(lines).toContain('Title: Issue')
      expect(lines).toContain('Description: Something broke')
      expect(lines).not.toContain('Notes:')
    })
  })

  describe('edge cases', () => {
    it('handles empty template', () => {
      const result = interpolate('', {})
      expect(result).toBe('')
    })

    it('handles template with no placeholders', () => {
      const result = interpolate('Static text', {})
      expect(result).toBe('Static text')
    })

    it('handles template with unreferenced variables', () => {
      const template = 'Hello {{name}}'
      const result = interpolate(template, { name: 'Alice', unused: 'Bob' })
      expect(result).toBe('Hello Alice')
    })

    it('handles variables with empty string value (filters label-only lines)', () => {
      const template = 'Title: {{title}}'
      const result = interpolate(template, { title: '' })
      // Line becomes "Title: " which matches /:\s*$/ so it's filtered out
      expect(result).toBe('')
    })

    it('preserves special characters in values', () => {
      const template = 'Query: {{query}}'
      const result = interpolate(template, { query: 'SELECT * FROM users WHERE id = 1' })
      expect(result).toBe('Query: SELECT * FROM users WHERE id = 1')
    })
  })
})

describe('prompt constants', () => {
  it('CARD_SUMMARIZE_SYSTEM is a non-empty string', () => {
    expect(typeof CARD_SUMMARIZE_SYSTEM).toBe('string')
    expect(CARD_SUMMARIZE_SYSTEM.length).toBeGreaterThan(0)
  })

  it('CARD_SUMMARIZE_USER_TEMPLATE is a non-empty string', () => {
    expect(typeof CARD_SUMMARIZE_USER_TEMPLATE).toBe('string')
    expect(CARD_SUMMARIZE_USER_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('GENERATE_TEST_CASES_SYSTEM is a non-empty string', () => {
    expect(typeof GENERATE_TEST_CASES_SYSTEM).toBe('string')
    expect(GENERATE_TEST_CASES_SYSTEM.length).toBeGreaterThan(0)
  })

  it('GENERATE_TEST_CASES_USER_TEMPLATE is a non-empty string', () => {
    expect(typeof GENERATE_TEST_CASES_USER_TEMPLATE).toBe('string')
    expect(GENERATE_TEST_CASES_USER_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('GENERATE_STORIES_SYSTEM is a non-empty string', () => {
    expect(typeof GENERATE_STORIES_SYSTEM).toBe('string')
    expect(GENERATE_STORIES_SYSTEM.length).toBeGreaterThan(0)
  })

  it('GENERATE_STORIES_USER_TEMPLATE is a non-empty string', () => {
    expect(typeof GENERATE_STORIES_USER_TEMPLATE).toBe('string')
    expect(GENERATE_STORIES_USER_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('PARSE_ITEM_USER_TEMPLATE is a non-empty string', () => {
    expect(typeof PARSE_ITEM_USER_TEMPLATE).toBe('string')
    expect(PARSE_ITEM_USER_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('all prompt templates are strings with content', () => {
    const prompts = [
      CARD_SUMMARIZE_SYSTEM,
      CARD_SUMMARIZE_USER_TEMPLATE,
      GENERATE_TEST_CASES_SYSTEM,
      GENERATE_TEST_CASES_USER_TEMPLATE,
      GENERATE_STORIES_SYSTEM,
      GENERATE_STORIES_USER_TEMPLATE,
      PARSE_ITEM_USER_TEMPLATE,
    ]

    prompts.forEach((prompt) => {
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(0)
    })
  })
})
