import { useState } from 'react'

export default function AddCardForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  function close() { setOpen(false); setTitle('') }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    onAdd(t)
    close()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg px-2 py-1.5 transition-colors"
      >
        <span className="text-base font-light leading-none">+</span>
        Add card
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        autoFocus
        value={title}
        rows={2}
        placeholder="Card title…"
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e as unknown as React.FormEvent) }
          if (e.key === 'Escape') close()
        }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-indigo-700 transition-colors"
        >
          Add
        </button>
        <button
          type="button"
          onClick={close}
          className="text-slate-500 text-sm hover:text-slate-700 px-2 py-1.5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
