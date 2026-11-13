// Used-prompt log (Feature 1): a dedicated view of every prompt that led
// to play — derived from journal entries carrying prompt text and from
// prompt notes explicitly marked used. Search by text, filter by era, total
// count, and a link to the journal entry each prompt led to.
//
// Prompt notes have no other listing in the UI (the dice roller only saves
// them), so this page also surfaces unlinked notes — not yet used, not yet
// tied to an entry — with a "Mark as used" affordance for each.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getActiveChronicle } from '../lib/localDb'
import {
  listUnlinkedPromptNotes,
  listUsedPrompts,
  markPromptNoteUsed,
  unmarkPromptNoteUsed,
} from '../lib/promptLog'
import type { UsedPrompt } from '../lib/promptLog'
import type { Chronicle, PromptNote } from '../db/types'
import { Badge, Button, EmptyState } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'

export default function PromptLog() {
  const [chronicle, setChronicle] = useState<Chronicle | null>(null)
  const [prompts, setPrompts] = useState<UsedPrompt[]>([])
  const [unlinked, setUnlinked] = useState<PromptNote[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [era, setEra] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function reload() {
    const c = await getActiveChronicle()
    setChronicle(c)
    if (!c) {
      setLoading(false)
      return
    }
    const [used, notes] = await Promise.all([listUsedPrompts(c.id), listUnlinkedPromptNotes(c.id)])
    setPrompts(used)
    setUnlinked(notes)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const e = era.trim().toLowerCase()
    return prompts.filter((p) => {
      if (q && ![p.text, p.ref ?? '', p.source ?? ''].join(' ').toLowerCase().includes(q)) return false
      if (e && !p.era.toLowerCase().includes(e)) return false
      return true
    })
  }, [prompts, query, era])

  async function handleMarkUsed(noteId: string) {
    setBusyId(noteId)
    try {
      await markPromptNoteUsed(noteId)
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  async function handleUnmark(item: UsedPrompt) {
    if (!item.promptNoteId) return
    setBusyId(item.id)
    try {
      await unmarkPromptNoteUsed(item.promptNoteId)
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="p-6">Loading the prompt log…</p>
  if (!chronicle) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-serif text-3xl">Used Prompts</h1>
        <p className="mt-3 text-ink-soft dark:text-parchment/80">
          No chronicle exists yet. Create a chronicle first — prompts belong to one.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Used Prompts</h1>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
            {chronicle.vampireName}’s prompts that led to play — {prompts.length}{' '}
            {prompts.length === 1 ? 'prompt' : 'prompts'} used.
            {visible.length !== prompts.length && ` Showing ${visible.length}.`}
          </p>
        </div>
        <Link to="/journal" className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white">
          Journal
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="prompt-log-search" className="block text-sm font-semibold">
            Search
          </label>
          <input
            id="prompt-log-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Prompt text, reference, or source…"
            className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel"
          />
        </div>
        <div>
          <label htmlFor="prompt-log-era" className="block text-sm font-semibold">
            Era
          </label>
          <input
            id="prompt-log-era"
            value={era}
            onChange={(e) => setEra(e.target.value)}
            placeholder="e.g. 14th century"
            className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={prompts.length === 0 ? 'No prompts used yet' : 'No prompts match'}>
            <p>
              {prompts.length === 0
                ? 'Save a journal entry with a prompt written down, or mark a prompt note as used below, and it will appear here.'
                : 'Try clearing a filter or searching a different phrase.'}
            </p>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {visible.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-gold/40 bg-parchment-card p-4 shadow-sm dark:border-gold/25 dark:bg-charcoal-card"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint dark:text-gold-light">
                {p.era || 'No era recorded'} · used {formatRelativeTime(p.usedAt)}
                {p.origin === 'promptNote' && <Badge tone="muted">Prompt note</Badge>}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{p.text}</p>
              {(p.ref || p.source) && (
                <p className="mt-1 text-xs text-ink-soft dark:text-parchment/70">
                  {[p.ref, p.source].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {p.journalEntryId ? (
                  <Link to={`/journal/${p.journalEntryId}`} className="text-oxblood underline dark:text-gold-light">
                    Journal entry →
                  </Link>
                ) : (
                  <span className="text-xs text-ink-faint dark:text-parchment/60">No journal entry yet</span>
                )}
                {p.origin === 'promptNote' && p.promptNoteId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === p.id}
                    onClick={() => void handleUnmark(p)}
                  >
                    Mark as unused
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {unlinked.length > 0 && (
        <section aria-labelledby="unlinked-prompts" className="mt-10">
          <h2 id="unlinked-prompts" className="font-serif text-xl">
            Prompt notes not used yet ({unlinked.length})
          </h2>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
            Notes saved from the dice roller, not yet tied to an entry. Mark one as used when you have played from it.
          </p>
          <ul className="mt-3 space-y-2">
            {unlinked.map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card"
              >
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.text}</p>
                  {(n.ref || n.source || n.era) && (
                    <p className="mt-1 text-xs text-ink-faint dark:text-parchment/60">
                      {[n.ref, n.source, n.era].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">
                    Saved {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === n.id}
                  onClick={() => void handleMarkUsed(n.id)}
                >
                  Mark as used
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm">
        <Link to="/journal" className="text-oxblood underline dark:text-gold-light">
          ← Back to journal
        </Link>
      </p>
    </main>
  )
}
