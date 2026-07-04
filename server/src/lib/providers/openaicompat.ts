import type { AIProvider, CompletionOptions, Message } from '../ai.js'
import { COMPLETE_TIMEOUT_MS, STREAM_TIMEOUT_MS, readProviderJson, logUsage, fetchWithRetry } from '../ai.js'
import { sseLines } from '../sseLines.js'

type ProviderVariant = 'openai' | 'azure' | 'ollama'

const DEFAULT_MODELS: Record<ProviderVariant, string> = {
  openai: 'gpt-4o',
  azure: 'gpt-4o',
  ollama: 'llama3',
}

const DEFAULT_BASE_URLS: Partial<Record<ProviderVariant, string>> = {
  openai: 'https://api.openai.com',
  ollama: 'http://localhost:11434',
}

export class OpenAICompatProvider implements AIProvider {
  private endpoint: string
  private model: string
  private authHeader: Record<string, string>

  constructor(variant: ProviderVariant) {
    const apiKey = process.env.AI_API_KEY ?? (variant === 'ollama' ? 'ollama' : undefined)
    const baseURL = process.env.AI_BASE_URL ?? DEFAULT_BASE_URLS[variant]

    if (variant === 'azure') {
      // For azure, AI_BASE_URL must be the full deployment endpoint URL
      if (!baseURL) throw new Error('AI_BASE_URL is required for the azure provider')
      this.endpoint = baseURL
      this.authHeader = apiKey ? { 'api-key': apiKey } : {}
    } else {
      if (!baseURL) throw new Error(`No base URL for provider "${variant}"`)
      this.endpoint = `${baseURL.replace(/\/$/, '')}/v1/chat/completions`
      this.authHeader = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
    }

    this.model = process.env.AI_MODEL ?? DEFAULT_MODELS[variant]
  }

  private get headers() {
    return { 'content-type': 'application/json', ...this.authHeader }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const messages: Array<{ role: string; content: string }> = []
    if (options?.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push({ role: 'user', content: prompt })

    const res = await fetchWithRetry(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: options?.model ?? this.model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature,
        stream: false,
        messages,
      }),
    }, COMPLETE_TIMEOUT_MS)
    if (!res.ok) throw new Error(`OpenAI-compat error ${res.status}: ${await res.text()}`)

    const json = await readProviderJson<{
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }>(res, 'OpenAI-compat')
    await logUsage('openai-compat', options?.model ?? this.model, { input: json.usage?.prompt_tokens, output: json.usage?.completion_tokens }, options?.usageContext)
    const text = json.choices[0]?.message?.content
    if (!text) throw new Error('Empty response from OpenAI-compatible provider')
    return text
  }

  async *stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string> {
    const res = await fetchWithRetry(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: options?.model ?? this.model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature,
        stream: true,
        stream_options: { include_usage: true },
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    }, STREAM_TIMEOUT_MS)
    if (!res.ok) throw new Error(`OpenAI-compat error ${res.status}: ${await res.text()}`)

    let inputTokens: number | undefined
    let outputTokens: number | undefined

    try {
      for await (const data of sseLines(res)) {
        if (data === '[DONE]') break
        try {
          const event = JSON.parse(data) as {
            choices: Array<{ delta: { content?: string } }>
            usage?: { prompt_tokens?: number; completion_tokens?: number }
          }
          if (event.usage) {
            inputTokens = event.usage.prompt_tokens
            outputTokens = event.usage.completion_tokens
          }
          const text = event.choices?.[0]?.delta?.content
          if (text) yield text
        } catch { /* skip non-JSON lines */ }
      }
    } finally {
      await logUsage('openai-compat', options?.model ?? this.model, { input: inputTokens, output: outputTokens }, options?.usageContext)
    }
  }
}
