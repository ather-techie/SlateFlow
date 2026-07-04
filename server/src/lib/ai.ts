import { db } from '../db/index.js'

export interface UsageContext {
  userId?: number
  projectId?: number
  endpoint: string
}

export interface CompletionOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  usageContext?: UsageContext
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>
  stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string>
}

// Hard caps so a hung provider can never hang a request forever. Streams get
// a longer window because slow local models (ollama) emit tokens gradually.
export const COMPLETE_TIMEOUT_MS = 60_000
export const STREAM_TIMEOUT_MS = 300_000

export async function readProviderJson<T>(res: Response, providerName: string): Promise<T> {
  try {
    return await res.json() as T
  } catch {
    throw new Error(`${providerName} returned malformed JSON (status ${res.status})`)
  }
}

export async function logUsage(
  provider: string,
  model: string | undefined,
  usage: { input?: number; output?: number },
  context?: UsageContext,
): Promise<void> {
  if (usage.input === undefined && usage.output === undefined) return

  console.log(`[ai-usage] provider=${provider} input_tokens=${usage.input ?? '?'} output_tokens=${usage.output ?? '?'}`)

  if (!context) return

  await db.run(
    `INSERT INTO ai_usage (project_id, user_id, provider, model, endpoint, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    context.projectId ?? null,
    context.userId ?? null,
    provider,
    model ?? null,
    context.endpoint,
    usage.input ?? 0,
    usage.output ?? 0,
  )
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
