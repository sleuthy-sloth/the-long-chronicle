// Story threads (Stream C): the unfinished business a vampire carries
// across centuries. Each thread has a status — Open, Dormant, Resolved,
// Abandoned — and can always be reopened; resolving asks for resolution
// notes so the ending of a thread is on the record, not just its start.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/database'
import { listMemories } from '../lib/memories'
import { listJournalEntries } from '../lib/journal'
import { listPeople, listPlaces } from '../lib/people'
import { useAppStore } from '../state/store'
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { useLiveList } from '../lib/live'
import {
  THREAD_STATUSES,
  THREAD_TRANSITIONS,
  createThread,
  deleteThread,
  listThreads,
  setThreadStatus,
} from '../lib/threads'
import type { StoryThread, ThreadStatus } from '../db/types'

const STATUS_TONE: Record<ThreadStatus, 'gold' | 'oxblood' | 'default' | 'muted'> = {
  Open: 'gold',
  Dormant: 'default',
  Resolved: 'oxblood',
  Abandoned: 'muted',
}

export default function Threads() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const chronicleId = activeChronicle?.id ?? null
  const threads = useLiveList(() => (chronicleId ? listThreads(chronicleId) : Promise.resolve([])), [chronicleId])
  const [statusFilter, setStatusFilter] = useState<ThreadStatus | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [names, setNames] = useState<{ people: Map<string, string>; places: Map<string, string>; memories: Map<string, string>; entries: Map<string, string> }>({
    people: new Map(),
    places: new Map(),
    memories: new Map(),
    entries: new Map(),
  })
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({})

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [introducedEra, setIntroducedEra] = useState('')

  useEffect(() => {
    if (!chronicleId) return
    let cancelled = false
    void Promise.all([
      listPeople(chronicleId),
      listPlaces(chronicleId),
      listMemories(chronicleId),
      listJournalEntries(chronicleId),
    ]).then(([people, places, memories, entries]) => {
      if (cancelled) return
      setNames({
        people: new Map(people.map((p) => [p.id, p.name])),
        places: new Map(places.map((p) => [p.id, p.name])),
        memories: new Map(memories.map((m) => [m.id, `${m.code}: ${m.title}`])),
        entries: new Map(entries.map((e) => [e.id, `Entry ${e.number}: ${e.title}`])),
      })
    })
    return () => {
      cancelled = true
    }
  }, [chronicleId])

  if (!activeChronicle) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold">Story threads</h1>
        <EmptyState title="No chronicle yet" action={<Link to="/chronicles" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Chronicles</Link>}>
          <p>Start a chronicle first — threads are the unfinished business of one vampire&rsquo;s life.</p>
        </EmptyState>
      </div>
    )
  }

  const filtered = (threads ?? []).filter((t) => statusFilter === 'all' || t.status === statusFilter)

  async function submitThread(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicleId || !title.trim()) return
    const thread = await createThread(chronicleId, {
      title,
      description: description || undefined,
      introducedEra: introducedEra || undefined,
    })
    setTitle('')
    setDescription('')
    setIntroducedEra('')
    setFormOpen(false)
    setMessage(`Thread “${thread.title}” opened.`)
  }

  async function transition(thread: StoryThread, status: ThreadStatus) {
    try {
      await setThreadStatus(thread.id, status, resolutionNotes[thread.id])
      setMessage(`“${thread.title}” is now ${status}.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Status change failed.')
    }
  }

  function linkedList(thread: StoryThread) {
    const items: Array<{ to: string; label: string }> = []
    for (const id of thread.personIds) {
      const name = names.people.get(id)
      if (name) items.push({ to: `/people/${id}`, label: name })
    }
    for (const id of thread.placeIds) {
      const name = names.places.get(id)
      if (name) items.push({ to: `/places/${id}`, label: name })
    }
    for (const id of thread.memoryIds) {
      const name = names.memories.get(id)
      if (name) items.push({ to: `/memories/${id}`, label: name })
    }
    for (const id of thread.journalEntryIds) {
      const name = names.entries.get(id)
      if (name) items.push({ to: `/journal/${id}`, label: name })
    }
    return items
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 font-serif text-3xl font-bold">Story threads</h1>
          <p className="text-sm text-ink-soft dark:text-parchment/70">
            Unfinished business, carried across centuries. A thread is never locked away — a resolved thread can
            always be reopened when it turns out it wasn&rsquo;t finished after all.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>Open a thread…</Button>
      </div>

      <div className="mb-4">
        <Field label="Show" htmlFor="thread-status-filter">
          <Select id="thread-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ThreadStatus | 'all')} className="w-44">
            <option value="all">All statuses</option>
            {THREAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {message && (
        <p role="status" className="mb-4 rounded-md bg-gold/15 px-3 py-2 text-sm dark:bg-gold/20">
          {message}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No threads here">
          <p>
            {statusFilter === 'all'
              ? 'Open the first thread — a debt unpaid, a question unanswered, a promise made in another century.'
              : `No ${statusFilter.toLowerCase()} threads right now.`}
          </p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {filtered.map((thread) => {
            const expanded = expandedId === thread.id
            const links = linkedList(thread)
            return (
              <li key={thread.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : thread.id)}
                    aria-expanded={expanded}
                    className="text-left font-serif text-xl font-semibold text-oxblood underline-offset-2 hover:underline dark:text-gold-light"
                  >
                    {thread.title}
                  </button>
                  <Badge tone={STATUS_TONE[thread.status]}>{thread.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">
                  {thread.introducedEra ? `Introduced ${thread.introducedEra}` : 'Introduction era not recorded'}
                </p>
                {thread.description && <p className="mt-2 text-sm leading-relaxed">{thread.description}</p>}
                {expanded && (
                  <div className="mt-3 space-y-3 border-t border-ink/10 pt-3 dark:border-parchment/10">
                    {links.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium">Linked records</h3>
                        <ul className="mt-1 space-y-1">
                          {links.map((link) => (
                            <li key={`${link.to}-${link.label}`} className="text-sm">
                              <Link to={link.to} className="text-oxblood underline dark:text-gold-light">
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {thread.resolutionNotes && (
                      <div>
                        <h3 className="text-sm font-medium">Resolution notes</h3>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{thread.resolutionNotes}</p>
                      </div>
                    )}
                    <div>
                      <Field label="Resolution notes (optional — shown when resolving)" htmlFor={`resolution-${thread.id}`}>
                        <Textarea
                          id={`resolution-${thread.id}`}
                          value={resolutionNotes[thread.id] ?? thread.resolutionNotes ?? ''}
                          onChange={(e) => setResolutionNotes((r) => ({ ...r, [thread.id]: e.target.value }))}
                          rows={2}
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {THREAD_TRANSITIONS[thread.status].map((next) => (
                        <Button key={next} size="sm" variant="outline" onClick={() => void transition(thread, next)}>
                          Mark {next}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void deleteThread(thread.id).then(() => setMessage(`Thread “${thread.title}” deleted.`))
                        }}
                      >
                        Delete thread
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Open a story thread">
        <form onSubmit={(e) => void submitThread(e)} className="space-y-4">
          <Field label="Title" htmlFor="thread-title">
            <Input id="thread-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. The debt owed to the miller" />
          </Field>
          <Field label="Introduced (era)" htmlFor="thread-era">
            <Input id="thread-era" value={introducedEra} onChange={(e) => setIntroducedEra(e.target.value)} placeholder="e.g. late 14th century" />
          </Field>
          <Field label="Description" htmlFor="thread-description">
            <Textarea id="thread-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <p className="text-xs text-ink-faint dark:text-parchment/50">
            People, places, memories, and entries can be linked to a thread from the journal and memory editors.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Open thread
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
