import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: { get: vi.fn(), all: vi.fn(), run: vi.fn() },
}))

vi.mock('./providers/anthropic.js', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    complete: vi.fn(),
    stream: vi.fn(),
  })),
}))

vi.mock('./providers/gemini.js', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => ({
    complete: vi.fn(),
    stream: vi.fn(),
  })),
}))

vi.mock('./providers/openaicompat.js', () => ({
  OpenAICompatProvider: vi.fn().mockImplementation(() => ({
    complete: vi.fn(),
    stream: vi.fn(),
  })),
}))

beforeEach(() => {
  // Reset modules to clear the _provider singleton
  vi.resetModules()
  // Reset all mocks between tests
  vi.clearAllMocks()
  // Clear env vars
  delete process.env.AI_PROVIDER
})

describe('getProvider', () => {
  describe('claude provider', () => {
    it('returns AnthropicProvider instance when AI_PROVIDER="claude"', async () => {
      process.env.AI_PROVIDER = 'claude'
      const { getProvider } = await import('./ai.js')

      const provider = await getProvider()

      expect(provider).toBeDefined()
      expect(provider.complete).toBeDefined()
      expect(provider.stream).toBeDefined()
    })

    it('instantiates AnthropicProvider without arguments', async () => {
      process.env.AI_PROVIDER = 'claude'
      const { AnthropicProvider } = await import('./providers/anthropic.js')
      const { getProvider } = await import('./ai.js')

      await getProvider()

      expect(vi.mocked(AnthropicProvider)).toHaveBeenCalledWith()
    })
  })

  describe('gemini provider', () => {
    it('returns GeminiProvider instance when AI_PROVIDER="gemini"', async () => {
      process.env.AI_PROVIDER = 'gemini'
      const { getProvider } = await import('./ai.js')

      const provider = await getProvider()

      expect(provider).toBeDefined()
      expect(provider.complete).toBeDefined()
      expect(provider.stream).toBeDefined()
    })

    it('instantiates GeminiProvider without arguments', async () => {
      process.env.AI_PROVIDER = 'gemini'
      const { GeminiProvider } = await import('./providers/gemini.js')
      const { getProvider } = await import('./ai.js')

      await getProvider()

      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith()
    })
  })

  describe('openai provider', () => {
    it('returns OpenAICompatProvider instance when AI_PROVIDER="openai"', async () => {
      process.env.AI_PROVIDER = 'openai'
      const { getProvider } = await import('./ai.js')

      const provider = await getProvider()

      expect(provider).toBeDefined()
    })

    it('instantiates OpenAICompatProvider with "openai" argument', async () => {
      process.env.AI_PROVIDER = 'openai'
      const { OpenAICompatProvider } = await import('./providers/openaicompat.js')
      const { getProvider } = await import('./ai.js')

      await getProvider()

      expect(vi.mocked(OpenAICompatProvider)).toHaveBeenCalledWith('openai')
    })
  })

  describe('azure provider', () => {
    it('returns OpenAICompatProvider instance when AI_PROVIDER="azure"', async () => {
      process.env.AI_PROVIDER = 'azure'
      const { getProvider } = await import('./ai.js')

      const provider = await getProvider()

      expect(provider).toBeDefined()
    })

    it('instantiates OpenAICompatProvider with "azure" argument', async () => {
      process.env.AI_PROVIDER = 'azure'
      const { OpenAICompatProvider } = await import('./providers/openaicompat.js')
      const { getProvider } = await import('./ai.js')

      await getProvider()

      expect(vi.mocked(OpenAICompatProvider)).toHaveBeenCalledWith('azure')
    })
  })

  describe('ollama provider', () => {
    it('returns OpenAICompatProvider instance when AI_PROVIDER="ollama"', async () => {
      process.env.AI_PROVIDER = 'ollama'
      const { getProvider } = await import('./ai.js')

      const provider = await getProvider()

      expect(provider).toBeDefined()
    })

    it('instantiates OpenAICompatProvider with "ollama" argument', async () => {
      process.env.AI_PROVIDER = 'ollama'
      const { OpenAICompatProvider } = await import('./providers/openaicompat.js')
      const { getProvider } = await import('./ai.js')

      await getProvider()

      expect(vi.mocked(OpenAICompatProvider)).toHaveBeenCalledWith('ollama')
    })
  })

  describe('singleton caching', () => {
    it('returns same instance on second call (singleton)', async () => {
      process.env.AI_PROVIDER = 'claude'
      const { getProvider } = await import('./ai.js')

      const provider1 = await getProvider()
      const provider2 = await getProvider()

      expect(provider1).toBe(provider2)
    })

    it('creates new instance when module is reset', async () => {
      process.env.AI_PROVIDER = 'claude'
      const { getProvider: getProvider1 } = await import('./ai.js')
      const provider1 = await getProvider1()

      // Reset module to clear singleton
      vi.resetModules()
      vi.clearAllMocks()

      process.env.AI_PROVIDER = 'claude'
      const { getProvider: getProvider2 } = await import('./ai.js')
      const provider2 = await getProvider2()

      expect(provider1).not.toBe(provider2)
    })
  })

  describe('invalid provider', () => {
    it('throws error when AI_PROVIDER is unknown', async () => {
      process.env.AI_PROVIDER = 'unknown_provider'
      const { getProvider } = await import('./ai.js')

      await expect(getProvider()).rejects.toThrow(/not supported/)
    })

    it('includes supported providers in error message', async () => {
      process.env.AI_PROVIDER = 'invalid'
      const { getProvider } = await import('./ai.js')

      await expect(getProvider()).rejects.toThrow(/claude.*gemini.*openai.*azure.*ollama/)
    })

    it('throws error when AI_PROVIDER is undefined', async () => {
      delete process.env.AI_PROVIDER
      const { getProvider } = await import('./ai.js')

      await expect(getProvider()).rejects.toThrow(/not supported/)
    })

    it('throws error when AI_PROVIDER is empty string', async () => {
      process.env.AI_PROVIDER = ''
      const { getProvider } = await import('./ai.js')

      await expect(getProvider()).rejects.toThrow(/not supported/)
    })

    it('throws error when AI_PROVIDER is null string', async () => {
      process.env.AI_PROVIDER = 'null'
      const { getProvider } = await import('./ai.js')

      await expect(getProvider()).rejects.toThrow(/not supported/)
    })
  })

  describe('provider initialization', () => {
    it('creates a new instance each time a provider is selected (first call only)', async () => {
      process.env.AI_PROVIDER = 'claude'
      const { AnthropicProvider } = await import('./providers/anthropic.js')
      const { getProvider } = await import('./ai.js')

      // First call should create instance
      await getProvider()
      expect(vi.mocked(AnthropicProvider)).toHaveBeenCalledTimes(1)

      // Second call returns cached instance, no new creation
      await getProvider()
      expect(vi.mocked(AnthropicProvider)).toHaveBeenCalledTimes(1)
    })

    it('all providers are callable and return AIProvider interface', async () => {
      const providers = ['claude', 'gemini', 'openai', 'azure', 'ollama']

      for (const providerName of providers) {
        vi.resetModules()
        vi.clearAllMocks()

        process.env.AI_PROVIDER = providerName
        const { getProvider } = await import('./ai.js')

        const provider = await getProvider()

        expect(typeof provider.complete).toBe('function')
        expect(typeof provider.stream).toBe('function')
      }
    })
  })

  describe('case sensitivity', () => {
    it('is case-sensitive (lowercase required)', async () => {
      process.env.AI_PROVIDER = 'CLAUDE'
      const { getProvider } = await import('./ai.js')

      await expect(getProvider()).rejects.toThrow()
    })

    it('rejects mixed-case provider names', async () => {
      process.env.AI_PROVIDER = 'Claude'
      const { getProvider } = await import('./ai.js')

      await expect(getProvider()).rejects.toThrow()
    })
  })
})

describe('fetchWithRetry', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.useRealTimers()
  })

  function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
    return new Response('{}', { status, headers })
  }

  it('returns immediately on a 200 response without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200))
    global.fetch = fetchMock as unknown as typeof fetch
    const { fetchWithRetry } = await import('./ai.js')

    const res = await fetchWithRetry('https://example.test', { method: 'POST' }, 1000)

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on a 503 and succeeds on a later attempt', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(200))
    global.fetch = fetchMock as unknown as typeof fetch
    const { fetchWithRetry } = await import('./ai.js')

    const promise = fetchWithRetry('https://example.test', { method: 'POST' }, 1000)
    await vi.runAllTimersAsync()
    const res = await promise

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('honors Retry-After header for delay', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(jsonResponse(200))
    global.fetch = fetchMock as unknown as typeof fetch
    const { fetchWithRetry } = await import('./ai.js')

    const promise = fetchWithRetry('https://example.test', { method: 'POST' }, 1000)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2)
    const res = await promise

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-retryable status like 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400))
    global.fetch = fetchMock as unknown as typeof fetch
    const { fetchWithRetry } = await import('./ai.js')

    const res = await fetchWithRetry('https://example.test', { method: 'POST' }, 1000)

    expect(res.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the last response after exhausting retries on persistent 503s', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503))
    global.fetch = fetchMock as unknown as typeof fetch
    const { fetchWithRetry } = await import('./ai.js')

    const promise = fetchWithRetry('https://example.test', { method: 'POST' }, 1000)
    await vi.runAllTimersAsync()
    const res = await promise

    expect(res.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries on a thrown network error and eventually throws after exhausting retries', async () => {
    vi.useFakeTimers()
    const networkError = new TypeError('fetch failed')
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    global.fetch = fetchMock as unknown as typeof fetch
    const { fetchWithRetry } = await import('./ai.js')

    const promise = fetchWithRetry('https://example.test', { method: 'POST' }, 1000)
    const assertion = expect(promise).rejects.toBe(networkError)
    await vi.runAllTimersAsync()
    await assertion

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('logUsage', () => {
  it('does nothing when neither input nor output tokens are defined', async () => {
    const { db } = await import('../db/index.js')
    const { logUsage } = await import('./ai.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logUsage('anthropic', 'claude-sonnet-4-6', {})

    expect(logSpy).not.toHaveBeenCalled()
    expect(db.run).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('logs to console but skips the DB insert when no context is passed', async () => {
    const { db } = await import('../db/index.js')
    const { logUsage } = await import('./ai.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logUsage('anthropic', 'claude-sonnet-4-6', { input: 10, output: 5 })

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('provider=anthropic'))
    expect(db.run).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('persists a row to ai_usage when context is passed', async () => {
    const { db } = await import('../db/index.js')
    const { logUsage } = await import('./ai.js')

    await logUsage(
      'anthropic',
      'claude-sonnet-4-6',
      { input: 100, output: 40 },
      { userId: 1, projectId: 2, endpoint: '/ai/cards/:id/summarize' },
    )

    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_usage'),
      2, 1, 'anthropic', 'claude-sonnet-4-6', '/ai/cards/:id/summarize', 100, 40,
    )
  })

  it('defaults project_id to null when the context has no projectId', async () => {
    const { db } = await import('../db/index.js')
    const { logUsage } = await import('./ai.js')

    await logUsage('gemini', undefined, { input: 5, output: 2 }, { endpoint: '/ai/parse-item' })

    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_usage'),
      null, null, 'gemini', null, '/ai/parse-item', 5, 2,
    )
  })
})

