import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StreamCallbacks } from '../api/stream'

vi.mock('../api/stream', () => ({
  postSSE: vi.fn(),
}))

import { postSSE } from '../api/stream'
import { useChatStore } from './chatStore'

beforeEach(() => {
  vi.clearAllMocks()
  useChatStore.setState({ messagesByProject: {}, streamingProjectId: null, error: null })
})

function mockStream(run: (cb: StreamCallbacks) => void) {
  vi.mocked(postSSE).mockImplementation(async (_url, _body, cb) => {
    run(cb)
  })
}

describe('chatStore', () => {
  it('appends the user message and streams the assistant reply', async () => {
    mockStream((cb) => {
      cb.onToken('Hel')
      cb.onToken('lo')
      cb.onDone()
    })

    await useChatStore.getState().sendMessage(1, 'hi there')

    const msgs = useChatStore.getState().messagesByProject[1]
    expect(msgs).toEqual([
      { role: 'user', content: 'hi there' },
      { role: 'assistant', content: 'Hello' },
    ])
    expect(useChatStore.getState().streamingProjectId).toBeNull()
    expect(useChatStore.getState().error).toBeNull()
  })

  it('sends the running history to the endpoint', async () => {
    mockStream((cb) => { cb.onToken('a'); cb.onDone() })
    await useChatStore.getState().sendMessage(1, 'first')
    await useChatStore.getState().sendMessage(1, 'second')

    const lastBody = vi.mocked(postSSE).mock.calls[1][1] as { messages: Array<{ role: string; content: string }> }
    expect(lastBody.messages.map(m => m.content)).toEqual(['first', 'a', 'second'])
  })

  it('drops the empty assistant bubble and records the error on failure', async () => {
    mockStream((cb) => cb.onError('provider down'))

    await useChatStore.getState().sendMessage(1, 'hi')

    const msgs = useChatStore.getState().messagesByProject[1]
    expect(msgs).toEqual([{ role: 'user', content: 'hi' }])
    expect(useChatStore.getState().error).toBe('provider down')
    expect(useChatStore.getState().streamingProjectId).toBeNull()
  })

  it('keeps partial assistant output when the stream errors midway', async () => {
    mockStream((cb) => {
      cb.onToken('partial answer')
      cb.onError('interrupted')
    })

    await useChatStore.getState().sendMessage(1, 'hi')

    const msgs = useChatStore.getState().messagesByProject[1]
    expect(msgs[msgs.length - 1]).toEqual({ role: 'assistant', content: 'partial answer' })
    expect(useChatStore.getState().error).toBe('interrupted')
  })

  it('ignores sends while a stream is in flight', async () => {
    useChatStore.setState({ streamingProjectId: 1 })
    await useChatStore.getState().sendMessage(1, 'second message')
    expect(postSSE).not.toHaveBeenCalled()
  })

  it('ignores empty input', async () => {
    await useChatStore.getState().sendMessage(1, '   ')
    expect(postSSE).not.toHaveBeenCalled()
  })

  it('keeps conversations separate per project', async () => {
    mockStream((cb) => { cb.onToken('ok'); cb.onDone() })
    await useChatStore.getState().sendMessage(1, 'for project one')
    await useChatStore.getState().sendMessage(2, 'for project two')

    expect(useChatStore.getState().messagesByProject[1][0].content).toBe('for project one')
    expect(useChatStore.getState().messagesByProject[2][0].content).toBe('for project two')
  })

  it('clear empties a single project conversation', async () => {
    mockStream((cb) => { cb.onToken('ok'); cb.onDone() })
    await useChatStore.getState().sendMessage(1, 'hello')
    useChatStore.getState().clear(1)
    expect(useChatStore.getState().messagesByProject[1]).toEqual([])
  })

  it('stop resets the streaming flag', () => {
    useChatStore.setState({ streamingProjectId: 5 })
    useChatStore.getState().stop()
    expect(useChatStore.getState().streamingProjectId).toBeNull()
  })
})
