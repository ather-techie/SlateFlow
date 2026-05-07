export interface CompletionOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>
  stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string>
}

let _provider: AIProvider | null = null

export async function getProvider(): Promise<AIProvider> {
  if (_provider) return _provider

  const provider = process.env.AI_PROVIDER
  switch (provider) {
    case 'claude': {
      const { AnthropicProvider } = await import('./providers/anthropic.js')
      _provider = new AnthropicProvider()
      break
    }
    case 'gemini': {
      const { GeminiProvider } = await import('./providers/gemini.js')
      _provider = new GeminiProvider()
      break
    }
    case 'openai':
    case 'azure':
    case 'ollama': {
      const { OpenAICompatProvider } = await import('./providers/openaicompat.js')
      _provider = new OpenAICompatProvider(provider)
      break
    }
    default:
      throw new Error(
        `AI_PROVIDER="${provider}" is not supported. ` +
        'Valid values: claude | gemini | openai | azure | ollama'
      )
  }

  return _provider!
}
