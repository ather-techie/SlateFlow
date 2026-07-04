import type { AIProvider, CompletionOptions, Message } from '../ai.js'
import { COMPLETE_TIMEOUT_MS, STREAM_TIMEOUT_MS, readProviderJson, logUsage } from '../ai.js'
import { sseLines } from '../sseLines.js'

type GeminiPart = { text: string }
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

interface GeminiBody {
  contents: GeminiContent[]
  system_instruction?: { parts: GeminiPart[] }
  generationConfig?: { maxOutputTokens?: number; temperature?: number }
}

export class GeminiProvider implements AIProvider {
  private apiKey: string
  private model: string
  private baseURL: string

  constructor() {
    const apiKey = process.env.AI_API_KEY
    if (!apiKey) throw new Error('AI_API_KEY is required for the Gemini provider')
    this.apiKey = apiKey
    this.model = process.env.AI_MODEL ?? 'gemini-2.0-flash'
    this.baseURL = (
      process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models'
    ).replace(/\/$/, '')
  }

  private buildBody(messages: Message[], options?: CompletionOptions): GeminiBody {
    const system =
      options?.systemPrompt ??
      messages.find(m => m.role === 'system')?.content

    const contents: GeminiContent[] = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    return {
      contents,
      ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      },
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const model = options?.model ?? this.model
    const url = `${this.baseURL}/${model}:generateContent?key=${this.apiKey}`
    const body = this.buildBody([{ role: 'user', content: prompt }], options)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COMPLETE_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)

    const json = await readProviderJson<{
      candidates: Array<{ content: { parts: GeminiPart[] } }>
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
    }>(res, 'Gemini')
    await logUsage('gemini', model, { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount }, options?.usageContext)
    const text = json.candidates[0]?.content?.parts[0]?.text
    if (!text) throw new Error('Empty response from Gemini')
    return text
  }

  async *stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string> {
    const model = options?.model ?? this.model
    const url = `${this.baseURL}/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`
    const body = this.buildBody(messages, options)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)

    let inputTokens: number | undefined
    let outputTokens: number | undefined

    try {
      for await (const data of sseLines(res)) {
        try {
          const event = JSON.parse(data) as {
            candidates: Array<{
              content: { parts: GeminiPart[] }
              finishReason?: string
            }>
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
          }
          if (event.usageMetadata) {
            inputTokens = event.usageMetadata.promptTokenCount
            outputTokens = event.usageMetadata.candidatesTokenCount
          }
          const candidate = event.candidates?.[0]
          const text = candidate?.content?.parts[0]?.text
          if (text) yield text
          if (candidate?.finishReason) break
        } catch { /* skip non-JSON lines */ }
      }
    } finally {
      await logUsage('gemini', model, { input: inputTokens, output: outputTokens }, options?.usageContext)
    }
  }
}
