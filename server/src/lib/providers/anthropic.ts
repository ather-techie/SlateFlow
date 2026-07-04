import type { AIProvider, CompletionOptions, Message } from '../ai.js'
import { COMPLETE_TIMEOUT_MS, STREAM_TIMEOUT_MS, readProviderJson, logUsage, fetchWithRetry } from '../ai.js'
import { sseLines } from '../sseLines.js'

export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private model: string
  private baseURL: string

  constructor() {
    const apiKey = process.env.AI_API_KEY
    if (!apiKey) throw new Error('AI_API_KEY is required for the Anthropic provider')
    this.apiKey = apiKey
    this.model = process.env.AI_MODEL ?? 'claude-sonnet-4-6'
    this.baseURL = (process.env.AI_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '')
  }

  private get headers() {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const res = await fetchWithRetry(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: options?.model ?? this.model,
        max_tokens: options?.maxTokens ?? 1024,
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    }, COMPLETE_TIMEOUT_MS)
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
    const json = await readProviderJson<{
      content: Array<{ type: string; text: string }>
      usage?: { input_tokens: number; output_tokens: number }
    }>(res, 'Anthropic')
    await logUsage('anthropic', options?.model ?? this.model, { input: json.usage?.input_tokens, output: json.usage?.output_tokens }, options?.usageContext)
    const text = json.content.find(b => b.type === 'text')?.text
    if (!text) throw new Error('Empty response from Anthropic')
    return text
  }

  async *stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string> {
    const system =
      options?.systemPrompt ??
      messages.find(m => m.role === 'system')?.content

    const res = await fetchWithRetry(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: options?.model ?? this.model,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true,
        ...(system ? { system } : {}),
        messages: messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content })),
      }),
    }, STREAM_TIMEOUT_MS)
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)

    let inputTokens: number | undefined
    let outputTokens: number | undefined

    try {
      for await (const data of sseLines(res)) {
        try {
          const event = JSON.parse(data) as {
            type: string
            delta?: { type: string; text: string }
            message?: { usage?: { input_tokens?: number; output_tokens?: number } }
            usage?: { output_tokens?: number }
          }
          if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens
            outputTokens = event.message?.usage?.output_tokens
          }
          if (event.type === 'message_delta' && event.usage?.output_tokens !== undefined) {
            outputTokens = event.usage.output_tokens
          }
          if (event.type === 'message_stop') break
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            yield event.delta.text
          }
        } catch { /* skip non-JSON comment lines */ }
      }
    } finally {
      await logUsage('anthropic', options?.model ?? this.model, { input: inputTokens, output: outputTokens }, options?.usageContext)
    }
  }
}
