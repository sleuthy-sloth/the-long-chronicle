import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db } from '../lib/localDb'
import type { JournalEntry, Memory, MemoryVersion, Person, Place } from '../db/types'
import {
  alterMemory,
  archiveMemory,
  getMemory,
  listMemoryVersions,
  loseMemory,
  restoreMemory,
  MEMORY_STATUS_META,
} from '../lib/memories'
import MemoryLossDialog, { type MemoryChangeInput } from '../components/MemoryLossDialog'
import AttachmentList from '../components/AttachmentList'

export default function MemoryDetail() {
  const { id } = useParams<{ id: string }>()
  const [memory, setMemory] = useState<Memory | null>(null)
  const [versions, setVersions] = useState<MemoryVersion[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogMode, setDialogMode] = useState<'lose' | 'alter' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function reload() {
    if (!id) return
    const m = await getMemory(id)
    if (!m) {
      setMemory(null)
      setLoading(false)
      return
    }
    setMemory(m)
    const [vs, ps, pls, es] = await Promise.all([
      listMemoryVersions(id),
      db.people.where('id').anyOf(m.personIds).toArray(),
      db.places.where('id').anyOf(m.placeIds).toArray(),
      db.journalEntries.where('id').anyOf(m.journalEntryIds).toArray(),
    ])
    setVersions(vs)
    setPeople(ps)
    setPlaces(pls)
    setEntries(es)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function run(action: () => Promise<Memory>, done: string) {
    setError(null)
    try {
      await action()
      setNotice(done)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  async function handleDialogConfirm(input: MemoryChangeInput) {
    if (!memory || !dialogMode) return
    const mode = dialogMode
    setDialogMode(null)
    if (mode === 'lose') {
      await run(() => loseMemory(memory.id, { note: input.note, changedEra: input.changedEra }), 'Memory marked lost. The original text is preserved.')
    } else {
      await run(
        () => alterMemory(memory.id, { newText: input.newText ?? memory.text, note: input.note, changedEra: input.changedEra }),
        'Memory altered. The previous wording is in the version history.',
      )
    }
  }

  if (loading) return <p className="p-6">Loading memory…</p>
  if (!memory) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-serif text-3xl">Memory not found</h1>
        <p className="mt-2"><Link to="/memories" className="text-oxblood underline">Back to memories</Link></p>
      </main>
    )
  }

  const meta = MEMORY_STATUS_META[memory.status]

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="text-sm">
        <Link to="/memories" className="text-oxblood underline dark:text-gold-light">← All memories</Link>
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
            {memory.code}
            {memory.occurredEra ? ` · ${memory.occurredEra}` : ''}
          </p>
          <h1 className="font-serif text-3xl leading-tight">{memory.title}</h1>
        </div>
        <span className="rounded-full border px-3 py-1 text-sm font-semibold" aria-label={`Status: ${meta.label}. ${meta.hint}`}>
          <span aria-hidden="true">{meta.icon} </span>
          {meta.label}
        </span>
      </div>

      {notice && <p role="status" className="mt-4 rounded border border-gold bg-gold/10 p-3 text-sm font-semibold">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded border border-oxblood bg-oxblood/10 p-3 text-sm font-semibold text-oxblood">{error}</p>}

      <article className="mt-5 whitespace-pre-wrap rounded-lg border border-gold/40 bg-parchment-card p-5 text-base leading-relaxed dark:border-gold/25 dark:bg-charcoal-card">
        {memory.text}
      </article>

      {memory.notes && (
        <section aria-labelledby="why-it-matters" className="mt-5">
          <h2 id="why-it-matters" className="font-serif text-xl">Why it matters</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft dark:text-parchment/85">{memory.notes}</p>
        </section>
      )}

      {memory.tags.length > 0 && (
        <section aria-label="Tags" className="mt-5">
          <ul className="flex flex-wrap gap-1.5">
            {memory.tags.map((t) => (
              <li key={t} className="rounded-full bg-parchment-deep px-2 py-0.5 text-xs dark:bg-charcoal-panel">{t}</li>
            ))}
          </ul>
        </section>
      )}

      <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Era it happened</dt><dd>{memory.occurredEra ?? '—'}</dd></div>
        <div><dt className="font-semibold">Era recorded</dt><dd>{memory.recordedEra ?? '—'}</dd></div>
        <div><dt className="font-semibold">First recorded</dt><dd>{new Date(memory.createdAt).toLocaleString()}</dd></div>
        <div><dt className="font-semibold">Last changed</dt><dd>{new Date(memory.updatedAt).toLocaleString()}</dd></div>
      </dl>

      <section aria-labelledby="linked-records" className="mt-6">
        <h2 id="linked-records" className="font-serif text-xl">Linked records</h2>
        <div className="mt-2 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <h3 className="font-semibold">People</h3>
            {people.length === 0 ? <p className="text-ink-faint">None linked.</p> : (
              <ul className="list-disc pl-5">{people.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold">Places</h3>
            {places.length === 0 ? <p className="text-ink-faint">None linked.</p> : (
              <ul className="list-disc pl-5">{places.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold">Journal entries</h3>
            {entries.length === 0 ? <p className="text-ink-faint">None linked.</p> : (
              <ul className="list-disc pl-5">
                {entries.map((e) => (
                  <li key={e.id}><Link to={`/journal/${e.id}`} className="text-oxblood underline">Entry {e.number} — {e.title}</Link></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="actions" className="mt-6 rounded-lg border border-gold/40 bg-parchment-card p-4 dark:border-gold/25 dark:bg-charcoal-card">
        <h2 id="actions" className="font-serif text-xl">What happens to this memory?</h2>
        <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
          Losing a memory never deletes it — the text stays on record and a version is written. Altering keeps the old wording in history.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {memory.status !== 'Lost' && (
            <button type="button" onClick={() => setDialogMode('lose')} className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white">
              Mark as lost
            </button>
          )}
          <button type="button" onClick={() => setDialogMode('alter')} className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold">
            Alter wording
          </button>
          {memory.status !== 'Active' && (
            <button
              type="button"
              onClick={() => void run(() => restoreMemory(memory.id), 'Memory restored to active.')}
              className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold"
            >
              Restore to active
            </button>
          )}
          {memory.status !== 'Archived' && (
            <button
              type="button"
              onClick={() => void run(() => archiveMemory(memory.id), 'Memory archived.')}
              className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold"
            >
              Archive
            </button>
          )}
        </div>
      </section>

      <section aria-labelledby="history" className="mt-6">
        <h2 id="history" className="font-serif text-xl">Version &amp; status history</h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft dark:text-parchment/80">
            No changes recorded yet — this is the original wording, as first written.
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {versions.map((v) => (
              <li key={v.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-gold/20 dark:bg-charcoal-card">
                <p className="text-sm font-semibold">
                  Version {v.version} — {MEMORY_STATUS_META[v.status].label}
                  <span className="font-normal text-ink-faint"> · {new Date(v.createdAt).toLocaleString()}</span>
                </p>
                {v.changedEra && <p className="text-xs text-ink-faint">Era of change: {v.changedEra}</p>}
                {v.note && <p className="mt-1 text-sm italic">{v.note}</p>}
                <blockquote className="mt-2 whitespace-pre-wrap border-l-4 border-gold pl-3 text-sm leading-relaxed">
                  {v.text}
                </blockquote>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AttachmentList chronicleId={memory.chronicleId} recordType="memory" recordId={memory.id} />

      {dialogMode && (
        <MemoryLossDialog
          memory={memory}
          mode={dialogMode}
          onConfirm={(input) => void handleDialogConfirm(input)}
          onCancel={() => setDialogMode(null)}
        />
      )}
    </main>
  )
}
