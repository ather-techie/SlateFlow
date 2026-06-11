import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../store/chatStore'

const STARTER_PROMPTS = [
  "What's blocking us?",
  'What shipped last sprint?',
  "Who's overloaded?",
]

interface Props {
  projectId: number
  onClose: () => void
}

export default function ProjectChatPanel({ projectId, onClose }: Props) {
  const { messagesByProject, streamingProjectId, error, sendMessage, stop, clear } = useChatStore()
  const messages = messagesByProject[projectId] ?? []
  const streaming = streamingProjectId === projectId
  const busy = streamingProjectId !== null

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Track length + tail size so the view follows tokens during streaming.
  const messageCount = messages.length
  const lastMessageChars = messages[messages.length - 1]?.content.length ?? 0
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messageCount, lastMessageChars])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput('')
    sendMessage(projectId, trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white border-l border-slate-200 shadow-xl z-40 flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-800">Ask your project</h2>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={() => clear(projectId)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close chat panel"
            className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="space-y-2 pt-4">
            <p className="text-xs text-slate-400 text-center mb-3">
              Ask anything about this project.
            </p>
            {STARTER_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                disabled={busy}
                className="block w-full text-left text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-2 disabled:opacity-50 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          messages.map((msg, i) => {
            const isLast = i === messages.length - 1
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {msg.content}
                  {isLast && msg.role === 'assistant' && streaming && (
                    <span className="animate-pulse">▍</span>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Composer */}
      <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask a question… (Enter to send)"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {streaming ? (
            <button
              onClick={stop}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || busy}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
