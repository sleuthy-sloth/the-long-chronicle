import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db, getActiveChronicle } from '../lib/localDb'
import type {
  Chronicle,
  JournalEntry,
  JournalEntryDraft,
  Memory,
  Person,
  Place,
  Resource,
  Skill,
} from '../db/types'
import { nowIso } from '../db/types'
import {
  editGuard,
  getDraftById,
  getDraftForEntry,
  getJournalEntry,
  linkedStateChangeCount,
  listJournalEntries,
  nextEntryNumber,
  saveDraft,
  saveEntryWithChanges,
  type SaveEntryInput,
} from '../lib/journal'
import { listMemories, nextMemoryCode } from '../lib/memories'
import JournalEditorForm from '../components/JournalEditorForm'
import { renderMarkdown } from '../lib/markdown'

/**
 * Serves three routes (Stream A wires these in App.tsx):
 *  /journal/new            — new entry (optionally ?draft=<draftId> to resume)
 *  /journal/:id/edit       — edit an existing entry
 *  /journal/:id            — read-only view of an entry
 */
export default function JournalEditor() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isEditRoute = location.pathname.endsWith('/edit')
  const isNewRoute = location.pathname.endsWith('/new')

  const [chronicle, setChronicle] = useState<Chronicle | null>(null)
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [draft, setDraft] = useState<JournalEntryDraft | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [linkedCount, setLinkedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pendingSave, setPendingSave] = useState<SaveEntryInput | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const c = await getActiveChronicle()
      setChronicle(c)
      if (!c) {
        setLoading(false)
        return
      }
      const [ps, pls, sk, rs, ms, es] = await Promise.all([
        db.people.where('chronicleId').equals(c.id).toArray(),
        db.places.where('chronicleId').equals(c.id).toArray(),
        db.skills.where('chronicleId').equals(c.id).toArray(),
        db.resources.where('chronicleId').equals(c.id).toArray(),
        listMemories(c.id),
        listJournalEntries(c.id),
      ])
      setPeople(ps)
      setPlaces(pls)
      setSkills(sk)
      setResources(rs)
      setMemories(ms)
      if (id && !isNewRoute) {
        const found = await getJournalEntry(id)
        setEntry(found ?? null)
        if (found) {
          setLinkedCount(await linkedStateChangeCount(found.id))
          if (isEditRoute) setDraft((await getDraftForEntry(found.id)) ?? null)
        }
      } else {
        const draftId = searchParams.get('draft')
        if (draftId) setDraft((await getDraftById(draftId)) ?? null)
      }
      setLoading(false)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNewRoute, isEditRoute])

  async function handleAutosave(d: JournalEntryDraft) {
    await saveDraft(d)
    setDraft(d)
  }

  async function doSave(input: SaveEntryInput, includeStateChanges: boolean) {
    if (!chronicle) return
    // Assign the next entry number for new entries.
    const entryIn = { ...input.entry }
    if (!entry) {
      const existing = await listJournalEntries(chronicle.id)
      entryIn.number = nextEntryNumber(existing)
    }
    // Assign M-codes to inline-created memories, in order.
    const assignedMemories: Memory[] = []
    const codePool = [...memories]
    for (const m of input.newMemories ?? []) {
      const code = nextMemoryCode(codePool)
      const withCode = { ...m, code, id: m.id, journalEntryIds: [entryIn.id] }
      codePool.push(withCode)
      assignedMemories.push(withCode)
    }
    // Inline memory ids in the entry already match the created rows (the
    // form used the same ids as keys), so the entry can be saved as-is.
    const finalEntry: JournalEntry = { ...entryIn }
    const result = await saveEntryWithChanges({
      entry: finalEntry,
      stateChanges: includeStateChanges ? input.stateChanges ?? [] : [],
      newMemories: assignedMemories,
      newThreadTitles: input.newThreadTitles ?? [],
    })
    // Keep linked memories' journalEntryIds in sync for pre-existing links.
    for (const mid of finalEntry.memoryIds) {
      const m = await db.memories.get(mid)
      if (m && !m.journalEntryIds.includes(finalEntry.id)) {
        await db.memories.update(mid, {
          journalEntryIds: [...m.journalEntryIds, finalEntry.id],
          updatedAt: nowIso(),
        })
      }
    }
    return result
  }

  async function handleSave(input: SaveEntryInput) {
    setSaveError(null)
    // Edit-old-entry guard: an entry with linked state changes must not be
    // edited without the player deciding what happens to those records.
    const guard = editGuard(linkedCount)
    if (entry && guard.needsWarning) {
      setPendingSave(input)
      return
    }
    try {
      await doSave(input, true)
      navigate('/journal')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Saving failed.')
    }
  }

  async function handleGuardChoice(includeStateChanges: boolean) {
    if (!pendingSave) return
    const input = pendingSave
    setPendingSave(null)
    try {
      await doSave(input, includeStateChanges)
      navigate('/journal')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Saving failed.')
    }
  }

  if (loading) return <p className="p-6">Loading editor…</p>
  if (!chronicle) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-serif text-3xl">Journal editor</h1>
        <p className="mt-3 text-ink-soft dark:text-parchment/80">No chronicle exists yet. Create a chronicle first — journal entries belong to one.</p>
      </main>
    )
  }
  if (id && !isNewRoute && !entry) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-serif text-3xl">Entry not found</h1>
        <p className="mt-2"><Link to="/journal" className="text-oxblood underline">Back to journal</Link></p>
      </main>
    )
  }

  // Read-only view: /journal/:id
  if (entry && !isEditRoute && !isNewRoute) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm">
          <Link to="/journal" className="text-oxblood underline dark:text-gold-light">← Journal</Link>
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Entry {entry.number} · {entry.era}
          {entry.location ? ` · ${entry.location}` : ''}
          {entry.pinned ? ' · 📌 Pinned' : ''}
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight">{entry.title}</h1>
        {entry.promptText && (
          <p className="mt-3 rounded border-l-4 border-gold bg-parchment-card p-3 text-sm italic dark:bg-charcoal-card">
            Prompt{entry.promptRef ? ` (${entry.promptRef})` : ''}: {entry.promptText}
            {entry.promptSource ? <span className="not-italic text-ink-faint"> — {entry.promptSource}</span> : null}
          </p>
        )}
        <article
          className="markdown-body mt-4 whitespace-pre-wrap rounded-lg border border-gold/40 bg-parchment-card p-5 leading-relaxed dark:border-gold/25 dark:bg-charcoal-card"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }}
        />
        {entry.choices && (
          <section className="mt-5"><h2 className="font-serif text-xl">Choices</h2><p className="mt-1 whitespace-pre-wrap text-sm">{entry.choices}</p></section>
        )}
        {entry.consequences && (
          <section className="mt-5"><h2 className="font-serif text-xl">Consequences</h2><p className="mt-1 whitespace-pre-wrap text-sm">{entry.consequences}</p></section>
        )}
        {entry.longTerm && (
          <section className="mt-5"><h2 className="font-serif text-xl">Long-term consequences</h2><p className="mt-1 whitespace-pre-wrap text-sm">{entry.longTerm}</p></section>
        )}
        <p className="mt-5 text-xs text-ink-faint">
          Last modified {new Date(entry.updatedAt).toLocaleString()}
          {entry.tags.length > 0 && ` · ${entry.tags.join(', ')}`}
        </p>
        <p className="mt-4">
          <Link to={`/journal/${entry.id}/edit`} className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white">
            Edit this entry
          </Link>
        </p>
      </main>
    )
  }

  const guard = editGuard(linkedCount)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="text-sm">
        <Link to="/journal" className="text-oxblood underline dark:text-gold-light">← Journal</Link>
      </p>
      <h1 className="mt-3 font-serif text-3xl">
        {entry ? `Edit entry ${entry.number} — ${entry.title}` : 'New journal entry'}
      </h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
        {entry ? 'Editing an earlier entry. Nothing you change here silently undoes later character changes.' : `Entry for ${chronicle.vampireName}, ${chronicle.currentEra}.`}
      </p>
      {saveError && <p role="alert" className="mt-4 rounded border border-oxblood bg-oxblood/10 p-3 text-sm font-semibold text-oxblood">{saveError}</p>}

      <div className="mt-6">
        <JournalEditorForm
          chronicle={chronicle}
          entry={entry}
          draft={draft}
          people={people}
          places={places}
          skills={skills}
          resources={resources}
          memories={memories}
          onAutosave={handleAutosave}
          onSave={handleSave}
          onCancel={() => navigate('/journal')}
        />
      </div>

      {pendingSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-guard-title" className="w-full max-w-lg rounded-lg bg-parchment-card p-6 shadow-xl dark:bg-charcoal-card">
            <h2 id="edit-guard-title" className="font-serif text-2xl">This entry already changed the character</h2>
            <p className="mt-2 text-sm leading-relaxed">{guard.message}</p>
            <p className="mt-2 text-sm">
              New character changes recorded in Step 4: <strong>{pendingSave.stateChanges?.length ?? 0}</strong>
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingSave(null)}
                className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => void handleGuardChoice(false)}
                className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold"
              >
                Save entry only
              </button>
              <button
                type="button"
                disabled={(pendingSave.stateChanges?.length ?? 0) === 0}
                onClick={() => void handleGuardChoice(true)}
                className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                title={(pendingSave.stateChanges?.length ?? 0) === 0 ? 'No new character changes were recorded in Step 4' : undefined}
              >
                Save entry + update state records
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
