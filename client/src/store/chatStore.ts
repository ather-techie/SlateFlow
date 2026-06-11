import { create } from 'zustand'
import { postSSE } from '../api/stream'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatState {
  // Keyed by project id; in-memory only (v1 is stateless server-side).
  messagesByProject: Record<number, ChatMessage[]>
  streamingProjectId: number | null
  error: string | null
  sendMessage: (projectId: number, text: string) => Promise<void>
  stop: () => void
  clear: (projectId: number) => void
}

const HISTORY_SENT = 20
let controller: AbortController | null = null

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByProject: {},
  streamingProjectId: null,
  error: null,

  sendMessage: async (projectId, text) => {
    const trimmed = text.trim()
    if (!trimmed || get().streamingProjectId !== null) return

    const history = get().messagesByProject[projectId] ?? []
    const outgoing: ChatMessage[] = [...history, { role: 'user', content: trimmed }]

    set(state => ({
      messagesByProject: {
        ...state.messagesByProject,
        [projectId]: [...outgoing, { role: 'assistant', content: '' }],
      },
      streamingProjectId: projectId,
      error: null,
    }))

    const appendToAssistant = (textDelta: string) => {
      set(state => {
        const msgs = [...(state.messagesByProject[projectId] ?? [])]
        const last = msgs[msgs.length - 1]
        if (!last || last.role !== 'assistant') return state
        msgs[msgs.length - 1] = { ...last, content: last.content + textDelta }
        return { messagesByProject: { ...state.messagesByProject, [projectId]: msgs } }
      })
    }

    controller = new AbortController()
    await postSSE(
      `/api/ai/projects/${projectId}/chat`,
      { messages: outgoing.slice(-HISTORY_SENT) },
      {
        onToken: appendToAssistant,
        onError: (message) => {
          set(state => {
            const msgs = [...(state.messagesByProject[projectId] ?? [])]
            const last = msgs[msgs.length - 1]
            // Drop the empty assistant bubble when nothing streamed.
            if (last && last.role === 'assistant' && last.content === '') msgs.pop()
            return {
              messagesByProject: { ...state.messagesByProject, [projectId]: msgs },
              streamingProjectId: null,
              error: message,
            }
          })
        },
        onDone: () => set({ streamingProjectId: null }),
      },
      controller.signal,
    )
    // Abort resolves postSSE without callbacks firing — clear the flag.
    if (get().streamingProjectId === projectId) set({ streamingProjectId: null })
    controller = null
  },

  stop: () => {
    controller?.abort()
    controller = null
    set({ streamingProjectId: null })
  },

  clear: (projectId) => {
    set(state => ({
      messagesByProject: { ...state.messagesByProject, [projectId]: [] },
      error: null,
    }))
  },
}))
