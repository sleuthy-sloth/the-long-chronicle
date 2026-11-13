// Person detail (Stream C): everything known about one person —
// description, status (free text), relationship, what they want, first
// and last known eras, notes, related memories and journal entries, and
// a dated relationship history.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/database'
import { useAppStore } from '../state/store'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Textarea } from '../components/ui'
import { useLiveList } from '../lib/live'
import {
  PERSON_STATUSES,
  addRelationshipNote,
  deletePerson,
  deleteRelationshipNote,
  linkedRecordsForPerson,
  listRelationships,
  updatePerson,
} from '../lib/people'
import type { JournalEntry, Memory, Relationship } from '../db/types'
import { formatRelativeTime } from '../lib/utils'

export default function PersonDetail() {
  const { personId } = useParams<{ personId: string }>()
  const navigate = useNavigate()
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const rows = useLiveList(
    () => (personId ? db.people.where('id').equals(personId).toArray() : Promise.resolve([])),
    [personId],
  )
  const person = rows?.[0]
  const [history, setHistory] = useState<Relationship[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editRelationship, setEditRelationship] = useState('')
  const [editWants, setEditWants] = useState('')
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const [noteText, setNoteText] = useState('')
  const [noteEra, setNoteEra] = useState('')

  useEffect(() => {
    if (!personId) return
    let cancelled = false
    void (async () => {
      const [historyRows, links] = await Promise.all([
        listRelationships(personId),
        linkedRecordsForPerson(personId),
      ])
      if (cancelled) return
      setHistory(historyRows)
      const [memRows, entryRows] = await Promise.all([
        db.memories.where('id').anyOf(links.memoryIds).toArray(),
        db.journalEntries.where('id').anyOf(links.entryIds).toArray(),
      ])
      if (cancelled) return
      setMemories(memRows.sort((a, b) => a.code.localeCompare(b.code)))
      setEntries(entryRows.sort((a, b) => a.number - b.number))
    })()
    return () => {
      cancelled = true
    }
  }, [personId, rows?.length])

  if (!personId) return <EmptyState title="No person selected" />
  if (rows !== undefined && !person) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold">Person not found</h1>
        <EmptyState title="That person isn&rsquo;t in the archive" action={<Link to="/people" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Back to People</Link>}>
          <p>They may have been deleted, or the link may belong to another chronicle.</p>
        </EmptyState>
      </div>
    )
  }
  if (!person) return <p className="p-6 text-sm text-ink-soft">Opening the record…</p>

  function openEdit() {
    setEditName(person!.name)
    setEditStatus(person!.status)
    setEditRelationship(person!.relationship ?? '')
    setEditWants(person!.wants ?? '')
    setEditFirst(person!.firstAppearance ?? '')
    setEditLast(person!.lastKnownEra ?? '')
    setEditDescription(person!.description ?? '')
    setEditNotes(person!.notes ?? '')
    setEditOpen(true)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    const updated = await updatePerson(person!.id, {
      name: editName.trim(),
      status: editStatus.trim() || 'Unknown',
      relationship: editRelationship.trim() || undefined,
      wants: editWants.trim() || undefined,
      firstAppearance: editFirst.trim() || undefined,
      lastKnownEra: editLast.trim() || undefined,
      description: editDescription.trim() || undefined,
      notes: editNotes.trim() || undefined,
    })
    setEditOpen(false)
    setMessage(`“${updated.name}” updated.`)
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteText.trim() || !noteEra.trim() || !activeChronicle) return
    const row = await addRelationshipNote(activeChronicle.id, person!.id, { description: noteText, era: noteEra })
    setHistory((h) => [...h, row])
    setNoteText('')
    setNoteEra('')
    setMessage('Relationship note added.')
  }

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link to="/people" className="text-oxblood underline dark:text-gold-light">← People &amp; Places</Link>
      </p>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-serif text-3xl font-bold">{person.name}</h1>
          <p className="text-sm text-ink-soft dark:text-parchment/70">
            {person.relationship ? `${person.relationship} · ` : ''}
            {person.firstAppearance ? `First seen ${person.firstAppearance}` : 'First appearance not recorded'}
            {person.lastKnownEra ? ` · Last known ${person.lastKnownEra}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEdit}>
            Edit
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete…
          </Button>
        </div>
      </div>

      <p className="mb-4">
        <Badge tone={person.status === 'Alive' ? 'gold' : person.status === 'Dead' ? 'oxblood' : 'default'}>
          {person.status}
        </Badge>
      </p>

      {message && (
        <p role="status" className="mb-4 rounded-md bg-gold/15 px-3 py-2 text-sm dark:bg-gold/20">
          {message}
        </p>
      )}

      {person.description && (
        <section aria-labelledby="person-desc" className="mb-6">
          <h2 id="person-desc" className="font-serif text-xl font-semibold">About them</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{person.description}</p>
        </section>
      )}

      <section aria-labelledby="person-wants" className="mb-6">
        <h2 id="person-wants" className="font-serif text-xl font-semibold">What they want</h2>
        <p className="mt-1 text-sm leading-relaxed">{person.wants || 'Not recorded.'}</p>
      </section>

      {person.notes && (
        <section aria-labelledby="person-notes" className="mb-6">
          <h2 id="person-notes" className="font-serif text-xl font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{person.notes}</p>
        </section>
      )}

      <section aria-labelledby="person-history" className="mb-6">
        <h2 id="person-history" className="font-serif text-xl font-semibold">Relationship history</h2>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">No dated notes yet — add the first below.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {history.map((note) => (
              <li key={note.id} className="rounded-md border border-ink/10 bg-parchment-card p-3 dark:border-parchment/10 dark:bg-charcoal-card">
                <p className="text-sm leading-relaxed">{note.description}</p>
                <p className="mt-1 flex items-center justify-between text-xs text-ink-faint dark:text-parchment/50">
                  <span>{note.era} · {formatRelativeTime(note.createdAt)}</span>
                  <button
                    type="button"
                    className="rounded px-1 underline"
                    onClick={() => void deleteRelationshipNote(note.id).then(() => setHistory((h) => h.filter((x) => x.id !== note.id)))}
                  >
                    Delete
                  </button>
                </p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => void submitNote(e)} className="mt-3 space-y-3 rounded-md border border-ink/10 p-3 dark:border-parchment/10">
          <Field label="New relationship note" htmlFor="rel-note">
            <Textarea id="rel-note" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} placeholder="How the relationship changed…" />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Era" htmlFor="rel-era">
              <Input id="rel-era" value={noteEra} onChange={(e) => setNoteEra(e.target.value)} placeholder="e.g. early 15th century" className="w-52" />
            </Field>
            <Button type="submit" disabled={!noteText.trim() || !noteEra.trim()}>
              Add note
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="person-linked" className="mb-6">
        <h2 id="person-linked" className="font-serif text-xl font-semibold">In the record</h2>
        {memories.length === 0 && entries.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">No memories or journal entries name this person yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {memories.map((m) => (
              <p key={m.id} className="text-sm">
                <Link to={`/memories/${m.id}`} className="text-oxblood underline dark:text-gold-light">
                  Memory {m.code}: {m.title}
                </Link>{' '}
                <span className="text-xs text-ink-faint dark:text-parchment/50">({m.status})</span>
              </p>
            ))}
            {entries.map((entry) => (
              <p key={entry.id} className="text-sm">
                <Link to={`/journal/${entry.id}`} className="text-oxblood underline dark:text-gold-light">
                  Entry {entry.number}: {entry.title}
                </Link>{' '}
                <span className="text-xs text-ink-faint dark:text-parchment/50">({entry.era})</span>
              </p>
            ))}
          </div>
        )}
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${person.name}`} wide>
        <form onSubmit={(e) => void submitEdit(e)} className="space-y-4">
          <Field label="Name" htmlFor="edit-person-name">
            <Input id="edit-person-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status (free text)" hint="Alive, Dead, Missing, Unknown, Undead — or your own wording." htmlFor="edit-person-status">
              <Input
                id="edit-person-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                list="person-status-options"
              />
              <datalist id="person-status-options">
                {PERSON_STATUSES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Relationship to the vampire" htmlFor="edit-person-relationship">
              <Input id="edit-person-relationship" value={editRelationship} onChange={(e) => setEditRelationship(e.target.value)} />
            </Field>
          </div>
          <Field label="What they want" htmlFor="edit-person-wants">
            <Input id="edit-person-wants" value={editWants} onChange={(e) => setEditWants(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First appearance (era)" htmlFor="edit-person-first">
              <Input id="edit-person-first" value={editFirst} onChange={(e) => setEditFirst(e.target.value)} />
            </Field>
            <Field label="Last known era" htmlFor="edit-person-last">
              <Input id="edit-person-last" value={editLast} onChange={(e) => setEditLast(e.target.value)} />
            </Field>
          </div>
          <Field label="Description" htmlFor="edit-person-description">
            <Textarea id="edit-person-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
          </Field>
          <Field label="Notes" htmlFor="edit-person-notes">
            <Textarea id="edit-person-notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!editName.trim()}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          void deletePerson(person.id).then(() => navigate('/people'))
        }}
        title={`Delete ${person.name}?`}
        confirmLabel="Delete person"
      >
        <p>
          This removes the person and their relationship history. Memories and journal entries that named them
          stay in the archive, but will no longer link here.
        </p>
      </ConfirmDialog>
    </div>
  )
}
