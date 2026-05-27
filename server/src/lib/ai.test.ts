import { describe, it, expect, beforeEach, vi } from 'vitest'

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

