// Place detail (Stream C): everything known about one place —
// description, region, first and last visits, what it means now, and the
// people, memories, and journal entries tied to it, with entries in
// chronological order so the place stays followable across long time jumps.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/database'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Textarea } from '../components/ui'
import { useLiveList } from '../lib/live'
import { deletePlace, linkedRecordsForPlace, updatePlace } from '../lib/people'
import type { JournalEntry, Memory, Person } from '../db/types'
import AttachmentList from '../components/AttachmentList'

export default function PlaceDetail() {
  const { placeId } = useParams<{ placeId: string }>()
  const navigate = useNavigate()
  const rows = useLiveList(
    () => (placeId ? db.places.where('id').equals(placeId).toArray() : Promise.resolve([])),
    [placeId],
  )
  const place = rows?.[0]
  const [people, setPeople] = useState<Person[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editRegion, setEditRegion] = useState('')
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editSignificance, setEditSignificance] = useState('')
  const [editDescription, setEditDescription] = useState('')

  useEffect(() => {
    if (!placeId) return
    let cancelled = false
    void (async () => {
      const links = await linkedRecordsForPlace(placeId)
      if (cancelled) return
      const [peopleRows, memRows, entryRows] = await Promise.all([
        db.people.where('id').anyOf(links.personIds).toArray(),
        db.memories.where('id').anyOf(links.memoryIds).toArray(),
        db.journalEntries.where('id').anyOf(links.entryIds).toArray(),
      ])
      if (cancelled) return
      setPeople(peopleRows.sort((a, b) => a.name.localeCompare(b.name)))
      setMemories(memRows.sort((a, b) => a.code.localeCompare(b.code)))
      setEntries(entryRows.sort((a, b) => a.number - b.number))
    })()
    return () => {
      cancelled = true
    }
  }, [placeId, rows?.length])

  if (!placeId) return <EmptyState title="No place selected" />
  if (rows !== undefined && !place) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold">Place not found</h1>
        <EmptyState title="That place isn&rsquo;t in the archive" action={<Link to="/places" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Back to Places</Link>}>
          <p>It may have been deleted, or the link may belong to another chronicle.</p>
        </EmptyState>
      </div>
    )
  }
  if (!place) return <p className="p-6 text-sm text-ink-soft">Opening the record…</p>

  function openEdit() {
    setEditName(place!.name)
    setEditRegion(place!.region ?? '')
    setEditFirst(place!.firstVisit ?? '')
    setEditLast(place!.lastVisit ?? '')
    setEditSignificance(place!.significance ?? '')
    setEditDescription(place!.description ?? '')
    setEditOpen(true)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    const updated = await updatePlace(place!.id, {
      name: editName.trim(),
      region: editRegion.trim() || undefined,
      firstVisit: editFirst.trim() || undefined,
      lastVisit: editLast.trim() || undefined,
      significance: editSignificance.trim() || undefined,
      description: editDescription.trim() || undefined,
    })
    setEditOpen(false)
    setMessage(`“${updated.name}” updated.`)
  }

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link to="/places" className="text-oxblood underline dark:text-gold-light">← People &amp; Places</Link>
      </p>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-serif text-3xl font-bold">{place.name}</h1>
          <p className="text-sm text-ink-soft dark:text-parchment/70">
            {place.region ? `${place.region} · ` : ''}
            {place.firstVisit ? `First visit ${place.firstVisit}` : 'First visit not recorded'}
            {place.lastVisit ? ` · Last visit ${place.lastVisit}` : ''}
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

      {message && (
        <p role="status" className="mb-4 rounded-md bg-gold/15 px-3 py-2 text-sm dark:bg-gold/20">
          {message}
        </p>
      )}

      {place.description && (
        <section aria-labelledby="place-desc" className="mb-6">
          <h2 id="place-desc" className="font-serif text-xl font-semibold">About this place</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{place.description}</p>
        </section>
      )}

      <section aria-labelledby="place-significance" className="mb-6">
        <h2 id="place-significance" className="font-serif text-xl font-semibold">What it means now</h2>
        <p className="mt-1 text-sm leading-relaxed">{place.significance || 'Not recorded.'}</p>
      </section>

      <section aria-labelledby="place-people" className="mb-6">
        <h2 id="place-people" className="font-serif text-xl font-semibold">People tied to this place</h2>
        {people.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">No one is linked here yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {people.map((p) => (
              <li key={p.id} className="text-sm">
                <Link to={`/people/${p.id}`} className="text-oxblood underline dark:text-gold-light">
                  {p.name}
                </Link>{' '}
                <Badge tone="muted">{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="place-record" className="mb-6">
        <h2 id="place-record" className="font-serif text-xl font-semibold">In the record — oldest first</h2>
        {memories.length === 0 && entries.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">No memories or journal entries name this place yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {entries.map((entry) => (
              <p key={entry.id} className="text-sm">
                <Link to={`/journal/${entry.id}`} className="text-oxblood underline dark:text-gold-light">
                  Entry {entry.number}: {entry.title}
                </Link>{' '}
                <span className="text-xs text-ink-faint dark:text-parchment/50">({entry.era})</span>
              </p>
            ))}
            {memories.map((m) => (
              <p key={m.id} className="text-sm">
                <Link to={`/memories/${m.id}`} className="text-oxblood underline dark:text-gold-light">
                  Memory {m.code}: {m.title}
                </Link>{' '}
                <span className="text-xs text-ink-faint dark:text-parchment/50">
                  ({m.status}{m.occurredEra ? ` · ${m.occurredEra}` : ''})
                </span>
              </p>
            ))}
          </div>
        )}
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${place.name}`} wide>
        <form onSubmit={(e) => void submitEdit(e)} className="space-y-4">
          <Field label="Name" htmlFor="edit-place-name">
            <Input id="edit-place-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Region / country" htmlFor="edit-place-region">
              <Input id="edit-place-region" value={editRegion} onChange={(e) => setEditRegion(e.target.value)} />
            </Field>
            <Field label="First visit (era)" htmlFor="edit-place-first">
              <Input id="edit-place-first" value={editFirst} onChange={(e) => setEditFirst(e.target.value)} />
            </Field>
            <Field label="Last visit (era)" htmlFor="edit-place-last">
              <Input id="edit-place-last" value={editLast} onChange={(e) => setEditLast(e.target.value)} />
            </Field>
          </div>
          <Field label="Current significance" htmlFor="edit-place-significance">
            <Input id="edit-place-significance" value={editSignificance} onChange={(e) => setEditSignificance(e.target.value)} placeholder="e.g. Where the letters are hidden" />
          </Field>
          <Field label="Description" htmlFor="edit-place-description">
            <Textarea id="edit-place-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
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

      <AttachmentList chronicleId={place.chronicleId} recordType="place" recordId={place.id} />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          void deletePlace(place.id).then(() => navigate('/places'))
        }}
        title={`Delete ${place.name}?`}
        confirmLabel="Delete place"
      >
        <p>
          This removes the place. Memories and journal entries that named it stay in the archive, but will no
          longer link here.
        </p>
      </ConfirmDialog>
    </div>
  )
}
