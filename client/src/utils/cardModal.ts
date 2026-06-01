import type { TestCase, TestCaseSummary } from '../types'

export const PRIORITIES: ('p0' | 'p1' | 'p2' | 'p3')[] = ['p0', 'p1', 'p2', 'p3']
export const PRIORITY_LABELS: Record<string, string> = {
  p0: 'Critical', p1: 'High', p2: 'Medium', p3: 'Low',
}
export const LABEL_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
  '#64748b', '#1e293b',
]

export function fmtDate(iso: string) {
  const d = new Date(iso.includes('Z') ? iso : iso + 'Z')
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtRelative(iso: string) {
  const secs = (Date.now() - new Date(iso.includes('Z') ? iso : iso + 'Z').getTime()) / 1000
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function activityText(action: string, meta: string): string {
  try {
    const m = JSON.parse(meta)
    if (action === 'create') return 'Card created'
    if (action === 'move') return 'Card moved between columns'
    if (action === 'comment') return `${m.author ?? 'Someone'} added a comment`
    if (action === 'test_run') return `Test "${m.title}" marked ${m.status}${m.run_by ? ` by ${m.run_by}` : ''}`
    if (action === 'update') {
      const fields = Object.keys(m).map(k => k.replace(/_/g, ' ')).join(', ')
      return `Updated ${fields}`
    }
    return action
  } catch { return action }
}

export function renderMarkdown(md: string): string {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = esc.split('\n')
  const out: string[] = []
  let inList = false
  function inline(s: string) {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs font-mono">$1</code>')
  }
  for (const raw of lines) {
    if (raw.startsWith('### ')) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h3 class="text-sm font-semibold mt-3 mb-0.5">${inline(raw.slice(4))}</h3>`) }
    else if (raw.startsWith('## ')) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h2 class="text-base font-semibold mt-3 mb-1">${inline(raw.slice(3))}</h2>`) }
    else if (raw.startsWith('# ')) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h1 class="text-lg font-bold mt-4 mb-1">${inline(raw.slice(2))}</h1>`) }
    else if (/^[-*] /.test(raw)) { if (!inList) { out.push('<ul class="list-disc pl-5 my-1 space-y-0.5">'); inList = true } out.push(`<li class="text-sm">${inline(raw.slice(2))}</li>`) }
    else if (raw === '') { if (inList) { out.push('</ul>'); inList = false } out.push('<div class="h-2"></div>') }
    else { if (inList) { out.push('</ul>'); inList = false } out.push(`<p class="text-sm mb-1">${inline(raw)}</p>`) }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

export function computeSummary(cases: TestCase[]): TestCaseSummary {
  return {
    total: cases.length,
    passed: cases.filter(t => t.status === 'passed').length,
    failed: cases.filter(t => t.status === 'failed').length,
    untested: cases.filter(t => t.status === 'untested').length,
    blocked: cases.filter(t => t.status === 'blocked').length,
    skipped: cases.filter(t => t.status === 'skipped').length,
  }
}
