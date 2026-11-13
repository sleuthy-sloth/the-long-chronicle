import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, getActiveChronicle } from '../lib/localDb'
import type { Chronicle, Memory, MemoryStatus, Person, Place } from '../db/types'
import {
  createMemory,
  filterMemories,
  nextMemoryCode,
  parseTags,
  searchMemories,
  tagCounts,
  MEMORY_STATUSES,
} from '../lib/memories'
import MemoryCard from '../components/MemoryCard'

const PAGE_SIZE = 25

export default function Memories() {
  const [chronicle, setChronicle] = useState<Chronicle | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<MemoryStatus | 'All'>('All')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [personId, setPersonId] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [era, setEra] = useState('')
  const [page, setPage] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Create form state
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')
  const [occurredEra, setOccurredEra] = useState('')
  const [recordedEra, setRecordedEra] = useState('')
  const [notes, setNotes] = useState('')
  const [selPeople, setSelPeople] = useState<string[]>([])
  const [selPlaces, setSelPlaces] = useState<string[]>([])

  async function reload() {
    const c = await getActiveChronicle()
    setChronicle(c)
    if (!c) {
      setMemories([])
      setLoading(false)
      return
    }
    const [ms, ps, pls] = await Promise.all([
      db.memories.where('chronicleId').equals(c.id).sortBy('code'),
      db.people.where('chronicleId').equals(c.id).toArray(),
      db.places.where('chronicleId').equals(c.id).toArray(),
    ])
    setMemories(ms)
    setPeople(ps)
    setPlaces(pls)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  const visible = useMemo(() => {
    const searched = searchMemories(memories, query)
    return filterMemories(searched, {
      status: statusTab,
      tag: tag || undefined,
      personId: personId || undefined,
      placeId: placeId || undefined,
      era: era || undefined,
    })
  }, [memories, query, statusTab, tag, personId, placeId, era])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const tags = useMemo(() => tagCounts(memories), [memories])
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: memories.length }
    for (const s of MEMORY_STATUSES) c[s] = memories.filter((m) => m.status === s).length
    return c
  }, [memories])

  useEffect(() => setPage(0), [query, statusTab, tag, personId, placeId, era])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicle || !title.trim() || !text.trim()) return
    setCreateError(null)
    try {
      await createMemory(chronicle.id, {
        title,
        text,
        tags: parseTags(tagsRaw),
        occurredEra: occurredEra || undefined,
        recordedEra: recordedEra || chronicle.currentEra,
        personIds: selPeople,
        placeIds: selPlaces,
        notes: notes || undefined,
      })
      setTitle('')
      setText('')
      setTagsRaw('')
      setOccurredEra('')
      setRecordedEra('')
      setNotes('')
      setSelPeople([])
      setSelPlaces([])
      setShowCreate(false)
      await reload()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not save the memory.')
    }
  }

  if (loading) return <p className="p-6">Loading memories…</p>
  if (!chronicle) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-serif text-3xl">Memories</h1>
        <p className="mt-3 text-ink-soft dark:text-parchment/80">
          No chronicle exists yet. Create a chronicle first — memories belong to one.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Memories</h1>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
            {chronicle.vampireName}’s archive — {memories.length} {memories.length === 1 ? 'memory' : 'memories'} on record.
            {memories.length > 0 && ` Next code: ${nextMemoryCode(memories)}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/review" className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold">
            Review memories
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            aria-expanded={showCreate}
            className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white"
          >
            {showCreate ? 'Close form' : 'Record a memory'}
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-6 rounded-lg border border-gold/40 bg-parchment-card p-5 dark:border-gold/25 dark:bg-charcoal-card">
          <h2 className="font-serif text-2xl">Record a memory</h2>
          {createError && <p role="alert" className="mt-2 text-sm font-semibold text-oxblood">{createError}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="mem-title" className="block text-sm font-semibold">Title</label>
              <input id="mem-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="mem-text" className="block text-sm font-semibold">Full text</label>
              <textarea id="mem-text" value={text} onChange={(e) => setText(e.target.value)} required rows={6} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
            </div>
            <div>
              <label htmlFor="mem-occurred" className="block text-sm font-semibold">Era it happened</label>
              <input id="mem-occurred" value={occurredEra} onChange={(e) => setOccurredEra(e.target.value)} placeholder="e.g. late 14th century" className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
            </div>
            <div>
              <label htmlFor="mem-recorded" className="block text-sm font-semibold">Era recorded</label>
              <input id="mem-recorded" value={recordedEra} onChange={(e) => setRecordedEra(e.target.value)} placeholder={chronicle.currentEra} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="mem-tags" className="block text-sm font-semibold">Tags (comma-separated)</label>
              <input id="mem-tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="mem-notes" className="block text-sm font-semibold">Why it matters</label>
              <textarea id="mem-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">People</legend>
              {people.length === 0 ? <p className="mt-1 text-sm text-ink-faint">None recorded yet.</p> : (
                <div className="mt-2 space-y-1">
                  {people.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selPeople.includes(p.id)} onChange={() => setSelPeople((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])} />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">Places</legend>
              {places.length === 0 ? <p className="mt-1 text-sm text-ink-faint">None recorded yet.</p> : (
                <div className="mt-2 space-y-1">
                  {places.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selPlaces.includes(p.id)} onChange={() => setSelPlaces((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])} />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
          <button type="submit" className="mt-5 rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white">
            Save memory
          </button>
        </form>
      )}

      <div className="mt-6 space-y-4">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {(['All', ...MEMORY_STATUSES] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={statusTab === s}
              onClick={() => setStatusTab(s)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${statusTab === s ? 'bg-oxblood text-white' : 'border-ink/30'}`}
            >
              {s} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="mem-search" className="block text-sm font-semibold">Search</label>
            <input id="mem-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, text or tag…" className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel" />
          </div>
          <div>
            <label htmlFor="mem-tag" className="block text-sm font-semibold">Tag</label>
            <select id="mem-tag" value={tag} onChange={(e) => setTag(e.target.value)} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel">
              <option value="">All tags</option>
              {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mem-person" className="block text-sm font-semibold">Person</label>
            <select id="mem-person" value={personId} onChange={(e) => setPersonId(e.target.value)} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel">
              <option value="">All people</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mem-place" className="block text-sm font-semibold">Place</label>
            <select id="mem-place" value={placeId} onChange={(e) => setPlaceId(e.target.value)} className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel">
              <option value="">All places</option>
              {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="mem-era" className="block text-sm font-semibold">Era (contains)</label>
          <input id="mem-era" value={era} onChange={(e) => setEra(e.target.value)} placeholder="e.g. 14th century" className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 sm:max-w-xs dark:border-gold/30 dark:bg-charcoal-panel" />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gold/60 p-8 text-center">
          <p className="font-serif text-xl">No memories match.</p>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
            {memories.length === 0
              ? 'Nothing recorded yet — the archive is empty. Record the first memory above.'
              : 'Try clearing a filter or searching a different phrase.'}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-faint" aria-live="polite">
            Showing {pageItems.length} of {visible.length} {visible.length === 1 ? 'memory' : 'memories'}
            {pageCount > 1 && ` — page ${safePage + 1} of ${pageCount}`}
          </p>
          <div className="mt-3 grid gap-4">
            {pageItems.map((m) => <MemoryCard key={m.id} memory={m} />)}
          </div>
          {pageCount > 1 && (
            <nav aria-label="Memory pages" className="mt-6 flex items-center justify-center gap-3">
              <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded border border-ink/30 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                Previous
              </button>
              <span className="text-sm">Page {safePage + 1} of {pageCount}</span>
              <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="rounded border border-ink/30 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                Next
              </button>
            </nav>
          )}
        </>
      )}
      <p className="mt-8 text-sm">
        <Link to="/journal" className="text-oxblood underline dark:text-gold-light">Go to the journal →</Link>
      </p>
    </main>
  )
}
