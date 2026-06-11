export async function* sseLines(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error('SSE response has no body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) yield line.slice(6)
      }
    }
    if (buffer.startsWith('data: ')) yield buffer.slice(6)
  } finally {
    reader.releaseLock()
  }
}
