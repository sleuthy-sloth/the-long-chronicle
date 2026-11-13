import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, getActiveChronicle } from '../lib/localDb'
import type { Chronicle, JournalEntry, JournalEntryDraft } from '../db/types'
import { deleteDraft, filterEntries, listDrafts, listJournalEntries, searchEntries, togglePinEntry } from '../lib/journal'

export default function Journal() {
  const [chronicle, setChronicle] = useState<Chronicle | null>(null)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [drafts, setDrafts] = useState<JournalEntryDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [era, setEra] = useState('')
  const [location, setLocation] = useState('')
  const [tag, setTag] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)

  async function reload() {
    const c = await getActiveChronicle()
    setChronicle(c)
    if (!c) {
      setLoading(false)
      return
    }
    const [es, ds] = await Promise.all([listJournalEntries(c.id), listDrafts(c.id)])
    setEntries(es)
    setDrafts(ds)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  const visible = useMemo(() => {
    const searched = searchEntries(entries, query)
    return filterEntries(searched, {
      era: era || undefined,
      location: location || undefined,
      tag: tag || undefined,
      pinnedOnly: pinnedOnly || undefined,
    })
  }, [entries, query, era, location, tag, pinnedOnly])

  const pinned = visible.filter((e) => e.pinned)
  const rest = visible.filter((e) => !e.pinned)
  const allTags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries])

  async function handlePin(id: string) {
    await togglePinEntry(id)
    await reload()
  }

  async function handleDeleteDraft(id: string) {
    await deleteDraft(id)
    await reload()
  }

  if (loading) return <p className="p-6">Loading journal…</p>
  if (!chronicle) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-serif text-3xl">Journal</h1>
        <p className="mt-3 text-ink-soft dark:text-parchment/80">No chronicle exists yet. Create a chronicle first — journal entries belong to one.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Journal</h1>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
            {chronicle.vampireName}’s journal — {entries.length} {entries.length === 1 ? 'entry' : 'entries'}.
          </p>
        </div>
        <Link to="/journal/new" className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white">
          New entry
        </Link>
      </div>

      {drafts.length > 0 && (
        <section aria-labelledby="drafts" className="mt-6 rounded-lg border border-dashed border-gold/60 bg-parchment-card p-4 dark:bg-charcoal-card">
          <h2 id="drafts" className="font-serif text-xl">Drafts ({drafts.length})</h2>
          <p className="text-sm text-ink-soft dark:text-parchment/80">Unfinished entries, autosaved as you wrote. They survive closing the app.</p>
          <ul className="mt-3 space-y-2">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{d.title || '(untitled draft)'}</strong>
                  <span className="text-ink-faint"> · {d.era} · last saved {new Date(d.updatedAt).toLocaleString()}</span>
                </span>
                <span className="flex gap-2">
                  <Link
                    to={d.entryId ? `/journal/${d.entryId}/edit` : `/journal/new?draft=${d.id}`}
                    className="rounded border border-ink/30 px-3 py-1 font-semibold"
                  >
                    Resume
                  </Link>
                  <button type="button" onClick={() => void handleDeleteDraft(d.id)} className="rounded border border-ink/30 px-3 py-1 font-semibold">
                    Discard
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="journal-search" className="block text-sm font-semibold">Search</label>
          <input id="journal-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Full text, title, prompt…" className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
        </div>
        <div>
          <label htmlFor="journal-era" className="block text-sm font-semibold">Era</label>
          <input id="journal-era" value={era} onChange={(e) => setEra(e.target.value)} placeholder="e.g. 14th century" className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
        </div>
        <div>
          <label htmlFor="journal-location" className="block text-sm font-semibold">Location</label>
          <input id="journal-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Venice" className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
        </div>
        <div>
          <label htmlFor="journal-tag" className="block text-sm font-semibold">Tag</label>
          <select id="journal-tag" value={tag} onChange={(e) => setTag(e.target.value)} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel">
            <option value="">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={pinnedOnly} onChange={(e) => setPinnedOnly(e.target.checked)} />
        Pinned only
      </label>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gold/60 p-8 text-center">
          <p className="font-serif text-xl">No entries match.</p>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
            {entries.length === 0
              ? 'The journal is empty. Begin with a new entry — the editor walks through context, prompt, writing, consequences and review.'
              : 'Try clearing a filter or searching a different phrase.'}
          </p>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section aria-labelledby="pinned-entries" className="mt-8">
              <h2 id="pinned-entries" className="font-serif text-xl">📌 Pinned</h2>
              <div className="mt-3 grid gap-4">
                {pinned.map((e) => <EntryCard key={e.id} entry={e} onPin={() => void handlePin(e.id)} />)}
              </div>
            </section>
          )}
          <section aria-labelledby="all-entries" className="mt-8">
            <h2 id="all-entries" className="font-serif text-xl">Chronological</h2>
            <div className="mt-3 grid gap-4">
              {rest.map((e) => <EntryCard key={e.id} entry={e} onPin={() => void handlePin(e.id)} />)}
            </div>
          </section>
        </>
      )}
      <p className="mt-8 text-sm">
        <Link to="/memories" className="text-oxblood underline dark:text-gold-light">← Back to memories</Link>
      </p>
    </main>
  )
}

function EntryCard({ entry, onPin }: { entry: JournalEntry; onPin: () => void }) {
  const excerpt = entry.body.length > 220 ? `${entry.body.slice(0, 220)}…` : entry.body
  return (
    <article className="rounded-lg border border-gold/40 bg-parchment-card p-4 shadow-sm dark:border-gold/25 dark:bg-charcoal-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint dark:text-gold-light">
            Entry {entry.number} · {entry.era}
            {entry.location ? ` · ${entry.location}` : ''}
          </p>
          <h3 className="font-serif text-xl leading-snug">
            <Link to={`/journal/${entry.id}`} className="text-ink hover:text-oxblood dark:text-parchment dark:hover:text-gold-light">
              {entry.title}
            </Link>
          </h3>
        </div>
        <button
          type="button"
          onClick={onPin}
          aria-pressed={entry.pinned}
          aria-label={entry.pinned ? `Unpin entry ${entry.number}` : `Pin entry ${entry.number}`}
          className="shrink-0 rounded border border-ink/30 px-2 py-1 text-sm"
          title={entry.pinned ? 'Unpin' : 'Pin'}
        >
          {entry.pinned ? '📌 Pinned' : 'Pin'}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft dark:text-parchment/85">{excerpt}</p>
      <p className="mt-3 text-xs text-ink-faint dark:text-parchment/60">
        Last modified {new Date(entry.updatedAt).toLocaleString()}
        {entry.tags.length > 0 && ` · ${entry.tags.join(', ')}`}
      </p>
      <p className="mt-2 text-sm">
        <Link to={`/journal/${entry.id}/edit`} className="text-oxblood underline dark:text-gold-light">Edit</Link>
      </p>
    </article>
  )
}
