// Global search palette (Stream A) — Cmd/Ctrl+K. Searches every entity type
// through src/lib/search.ts; other streams' data is searchable as soon as it
// is in Dexie. Arrow keys move, Enter opens, Esc closes.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchAll, type SearchResult } from '../lib/search'
import { useAppStore } from '../state/store'
import { cn } from '../lib/utils'

const KIND_TONE: Record<SearchResult['kind'], string> = {
  Chronicle: 'bg-oxblood/10 text-oxblood dark:text-red-200',
  Memory: 'bg-gold/15 text-gold dark:text-gold-light',
  'Journal entry': 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
  Person: 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
  Place: 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
  Thread: 'bg-gold/15 text-gold dark:text-gold-light',
  Skill: 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
  Resource: 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
  Note: 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
  Recap: 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
}

export default function SearchPalette() {
  const open = useAppStore((s) => s.searchOpen)
  const setOpen = useAppStore((s) => s.setSearchOpen)
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    setSelected(0)
    // Focus after paint so the modal is in the DOM.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open ])

  useEffect(() => {
    if (!open) return
    if (query.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      void searchAll(query, activeChronicle?.id).then((r) => {
        setResults(r)
        setSelected(0)
        setSearching(false)
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [query, open, activeChronicle?.id])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  const close = () => setOpen(false)
  const choose = (r: SearchResult) => {
    close()
    navigate(r.route)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(results.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault()
      choose(results[selected])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={close} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search the chronicle"
        className="w-full max-w-xl overflow-hidden rounded-lg bg-parchment-card shadow-xl dark:bg-charcoal-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3 dark:border-parchment/10">
          <span aria-hidden="true" className="text-ink-faint dark:text-parchment/60">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories, journal, people, places…"
            aria-label="Search the chronicle"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint/70 dark:text-parchment dark:placeholder:text-parchment/40"
          />
          <kbd className="rounded border border-ink/25 px-1.5 py-0.5 text-[11px] text-ink-soft dark:border-parchment/30 dark:text-parchment/70">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-2" role="listbox" aria-label="Search results">
          {query.trim().length < 2 && (
            <li className="px-4 py-3 text-sm text-ink-faint dark:text-parchment/60">
              Type at least two characters to search{activeChronicle ? ` “${activeChronicle.title}”` : ' all chronicles'}.
            </li>
          )}
          {query.trim().length >= 2 && searching && <li className="px-4 py-3 text-sm text-ink-faint dark:text-parchment/60">Searching…</li>}
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-faint dark:text-parchment/60">Nothing found for “{query}”.</li>
          )}
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.id}`} data-index={i} role="option" aria-selected={i === selected}>
              <button
                type="button"
                onClick={() => choose(r)}
                onMouseEnter={() => setSelected(i)}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-2.5 text-left',
                  i === selected ? 'bg-gold/15 dark:bg-gold/20' : '',
                )}
              >
                <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', KIND_TONE[r.kind])}>
                  {r.kind}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink dark:text-parchment">{r.title}</span>
                  {r.snippet && <span className="block truncate text-xs text-ink-soft dark:text-parchment/70">{r.snippet}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink/10 px-4 py-2 text-xs text-ink-faint dark:border-parchment/10 dark:text-parchment/50">
          ↑↓ to move · Enter to open · Esc to close
        </div>
      </div>
    </div>
  )
}
