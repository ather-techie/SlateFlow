import { describe, it, expect } from 'vitest'
import { sseLines } from './sseLines'

function makeResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream)
}

describe('sseLines', () => {
  describe('single data lines', () => {
    it('yields "data: foo" → "foo"', async () => {
      const response = makeResponse(['data: foo\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['foo'])
    })

    it('yields "data: hello world" → "hello world"', async () => {
      const response = makeResponse(['data: hello world\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['hello world'])
    })

    it('yields "data: " (empty value) → empty string', async () => {
      const response = makeResponse(['data: \n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual([''])
    })
  })

  describe('non-data lines', () => {
    it('skips lines without "data: " prefix', async () => {
      const response = makeResponse(['event: ping\n', 'data: foo\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['foo'])
    })

    it('skips comment lines (starting with colon)', async () => {
      const response = makeResponse([': comment\n', 'data: bar\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['bar'])
    })

    it('skips empty lines', async () => {
      const response = makeResponse(['\n', 'data: baz\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['baz'])
    })
  })

  describe('multiple lines in one chunk', () => {
    it('yields multiple "data: " lines from single chunk', async () => {
      const response = makeResponse(['data: line1\ndata: line2\ndata: line3\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['line1', 'line2', 'line3'])
    })

    it('yields only data lines when mixed with non-data', async () => {
      const response = makeResponse(['data: a\nevent: x\ndata: b\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['a', 'b'])
    })
  })

  describe('multi-chunk streaming', () => {
    it('reassembles partial line across chunks', async () => {
      const response = makeResponse(['data: hel', 'lo\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['hello'])
    })

    it('reassembles partial "data: " prefix across chunks', async () => {
      const response = makeResponse(['da', 'ta: ', 'content\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['content'])
    })

    it('handles many small chunks', async () => {
      const chunks = 'data: message\n'.split('')
      const response = makeResponse(chunks)
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['message'])
    })

    it('yields multiple data lines across multiple chunks', async () => {
      const response = makeResponse(['data: line1\nda', 'ta: line2\ndata: ', 'line3\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['line1', 'line2', 'line3'])
    })
  })

  describe('buffer flushing', () => {
    it('flushes remaining "data: " line without trailing newline', async () => {
      const response = makeResponse(['data: final'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['final'])
    })

    it('ignores buffer without "data: " prefix at end', async () => {
      const response = makeResponse(['data: first\nevent: x'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['first'])
    })

    it('yields data line when no final newline', async () => {
      const response = makeResponse(['data: msg1\ndata: msg2'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['msg1', 'msg2'])
    })
  })

  describe('edge cases', () => {
    it('handles empty response', async () => {
      const response = makeResponse([])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual([])
    })

    it('handles response with only newlines', async () => {
      const response = makeResponse(['\n\n\n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual([])
    })

    it('handles very long data line', async () => {
      const longText = 'x'.repeat(10000)
      const response = makeResponse([`data: ${longText}\n`])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual([longText])
    })

    it('handles JSON data', async () => {
      const json = '{"type":"message","content":"hello"}'
      const response = makeResponse([`data: ${json}\n`])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual([json])
    })

    it('preserves whitespace in data', async () => {
      const response = makeResponse(['data:   spaced   content  \n'])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['  spaced   content  '])
    })
  })

  describe('reader lock management', () => {
    it('releases reader lock after stream ends', async () => {
      const response = makeResponse(['data: test\n'])
      let readerReleased = false

      const originalRead = response.body!.getReader
      response.body!.getReader = function () {
        const reader = originalRead.call(this)
        const originalReleaseLock = reader.releaseLock.bind(reader)
        reader.releaseLock = () => {
          readerReleased = true
          originalReleaseLock()
        }
        return reader
      }

      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }

      expect(readerReleased).toBe(true)
    })

    it('releases reader lock even if stream is not fully consumed', async () => {
      const response = makeResponse(['data: 1\ndata: 2\ndata: 3\n'])
      let readerReleased = false

      const originalRead = response.body!.getReader
      response.body!.getReader = function () {
        const reader = originalRead.call(this)
        const originalReleaseLock = reader.releaseLock.bind(reader)
        reader.releaseLock = () => {
          readerReleased = true
          originalReleaseLock()
        }
        return reader
      }

      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
        if (lines.length === 1) break // Stop after first line
      }

      expect(readerReleased).toBe(true)
    })
  })

  describe('real-world SSE patterns', () => {
    it('parses typical SSE response with "data: " format', async () => {
      const sseResponse = 'data: {"token":"hello"}\ndata: {"token":" world"}\ndata: [DONE]\n'
      const response = makeResponse([sseResponse])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual([
        '{"token":"hello"}',
        '{"token":" world"}',
        '[DONE]',
      ])
    })

    it('handles SSE with event field', async () => {
      const sseResponse = 'event: message\ndata: content1\nevent: update\ndata: content2\n'
      const response = makeResponse([sseResponse])
      const lines: string[] = []
      for await (const line of sseLines(response)) {
        lines.push(line)
      }
      expect(lines).toEqual(['content1', 'content2'])
    })
  })
})
