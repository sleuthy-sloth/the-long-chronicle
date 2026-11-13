// Timeline (Stream C): the centuries in order.
//
// Saved custom/historical events (timelineEvents table) are merged with
// events derived from journal entries, memories, and skill/resource
// changes, then sorted — dated first by year, undated in entry order —
// so vague labels ("late 14th century") never break the list and never
// force a fake exact date. Derived rows link back to their source;
// only saved events can be deleted here.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, listStateChanges } from '../db/database'
import { listJournalEntries } from '../lib/journal'
import { listMemories } from '../lib/memories'
import { listPeople, listPlaces } from '../lib/people'
import { useAppStore } from '../state/store'
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { useLiveList } from '../lib/live'
import {
  deriveTimelineEvents,
  eventVampireAge,
  filterTimelineEvents,
  makeTimelineEvent,
  parseEventMeta,
  sortTimelineEvents,
} from '../lib/timeline'
import type { TimelineEvent } from '../db/types'
import { formatRelativeTime } from '../lib/utils'

const EVENT_TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'journal', label: 'Journal entries' },
  { value: 'memory', label: 'Memories' },
  { value: 'historical', label: 'Historical events' },
  { value: 'relationship', label: 'Relationships' },
  { value: 'location', label: 'Locations' },
  { value: 'skill', label: 'Skills' },
  { value: 'resource', label: 'Resources' },
  { value: 'custom', label: 'Custom events' },
] as const

type EventTypeFilter = (typeof EVENT_TYPES)[number]['value']

function EventSourceLink({ event }: { event: TimelineEvent }) {
  if (event.type === 'journal' && event.sourceId) {
    return (
      <Link to={`/journal/${event.sourceId}`} className="text-oxblood underline dark:text-gold-light">
        Open journal entry
      </Link>
    )
  }
  if (event.type === 'memory' && event.sourceId) {
    return (
      <Link to={`/memories/${event.sourceId}`} className="text-oxblood underline dark:text-gold-light">
        Open memory
      </Link>
    )
  }
  return null
}

export default function Timeline() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const chronicleId = activeChronicle?.id ?? null
  const savedEvents = useLiveList(
    () => (chronicleId ? db.timelineEvents.where('chronicleId').equals(chronicleId).toArray() : Promise.resolve([])),
    [chronicleId],
  )
  const [derived, setDerived] = useState<TimelineEvent[]>([])
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([])
  const [places, setPlaces] = useState<Array<{ id: string; name: string }>>([])
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>('all')
  const [eraQuery, setEraQuery] = useState('')
  const [personFilter, setPersonFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // New-event form state
  const [title, setTitle] = useState('')
  const [era, setEra] = useState('')
  const [sortYear, setSortYear] = useState('')
  const [eventType, setEventType] = useState<'historical' | 'custom'>('historical')
  const [description, setDescription] = useState('')
  const [age, setAge] = useState('')
  const [location, setLocation] = useState('')
  const [linkPersonIds, setLinkPersonIds] = useState<string[]>([])
  const [linkPlaceIds, setLinkPlaceIds] = useState<string[]>([])

  useEffect(() => {
    if (!chronicleId) {
      setDerived([])
      setPeople([])
      setPlaces([])
      return
    }
    let cancelled = false
    void Promise.all([
      listJournalEntries(chronicleId),
      listMemories(chronicleId),
      listStateChanges(chronicleId),
      listPeople(chronicleId),
      listPlaces(chronicleId),
    ]).then(([entries, memories, changes, peopleRows, placeRows]) => {
      if (cancelled) return
      setDerived(deriveTimelineEvents({ entries, memories, stateChanges: changes }))
      setPeople(peopleRows.map((p) => ({ id: p.id, name: p.name })))
      setPlaces(placeRows.map((p) => ({ id: p.id, name: p.name })))
    })
    return () => {
      cancelled = true
    }
  }, [chronicleId])

  const events = useMemo(() => {
    const merged = [...(savedEvents ?? []), ...derived]
    return filterTimelineEvents(sortTimelineEvents(merged), {
      type: typeFilter,
      eraQuery,
      personId: personFilter || null,
    })
  }, [savedEvents, derived, typeFilter, eraQuery, personFilter])

  if (!activeChronicle) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold">Timeline</h1>
        <EmptyState title="No chronicle yet" action={<Link to="/chronicles" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Chronicles</Link>}>
          <p>Start a chronicle first — the timeline is the story of one vampire&rsquo;s centuries.</p>
        </EmptyState>
      </div>
    )
  }

  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown person'
  const placeName = (id: string) => places.find((p) => p.id === id)?.name ?? 'Unknown place'

  async function submitEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicleId || !title.trim() || !era.trim()) return
    const parsedYear = sortYear.trim() === '' ? null : Number(sortYear)
    if (sortYear.trim() !== '' && parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 0)) {
      setMessage('The sort year must be a whole number, or left blank.')
      return
    }
    const event = makeTimelineEvent(chronicleId, {
      title,
      era,
      sortYear: parsedYear,
      type: eventType,
      description,
      age: age.trim() === '' ? null : Number(age),
      location: location.trim() || null,
      personIds: linkPersonIds,
      placeIds: linkPlaceIds,
    })
    await db.timelineEvents.put(event)
    setTitle('')
    setEra('')
    setSortYear('')
    setDescription('')
    setAge('')
    setLocation('')
    setLinkPersonIds([])
    setLinkPlaceIds([])
    setFormOpen(false)
    setMessage(`“${event.title}” added to the timeline.`)
  }

  async function deleteEvent(event: TimelineEvent) {
    await db.timelineEvents.delete(event.id)
    setMessage(`“${event.title}” removed from the timeline.`)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 font-serif text-3xl font-bold">Timeline</h1>
          <p className="text-sm text-ink-soft dark:text-parchment/70">
            {activeChronicle.vampireName}&rsquo;s centuries, in order — journal entries, memories, changes, and the
            historical moments they brush against. Approximate dates sit in entry order, never forced into a
            calendar.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>Add event…</Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <Field label="Type" htmlFor="timeline-type">
          <Select id="timeline-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as EventTypeFilter)} className="w-44">
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Era contains" htmlFor="timeline-era">
          <Input id="timeline-era" value={eraQuery} onChange={(e) => setEraQuery(e.target.value)} placeholder="e.g. 14th century" className="w-52" />
        </Field>
        <Field label="Person" htmlFor="timeline-person">
          <Select id="timeline-person" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="w-52">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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

      {events.length === 0 ? (
        <EmptyState title="Nothing on the timeline yet">
          <p>Journal entries and memories will appear here as they are written. Or add a historical event — a war, a coronation, a plague year — to anchor the story.</p>
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => {
            const meta = parseEventMeta(event.description)
            const derivedAge = activeChronicle ? eventVampireAge(event, activeChronicle) : null
            const age = meta.age ?? derivedAge
            const isSaved = !event.id.startsWith('derived:')
            return (
              <li key={event.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-xl font-semibold">{event.title}</h2>
                  <Badge tone={event.type === 'journal' ? 'gold' : event.type === 'memory' ? 'oxblood' : 'default'}>
                    {event.type}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
                  {event.era || 'No era given'}
                  {event.sortYear !== null && event.sortYear !== undefined && ` · year ${event.sortYear}`}
                  {age !== null && ` · vampire age ${age}`}
                  {meta.location && ` · ${meta.location}`}
                </p>
                {meta.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{meta.body}</p>}
                {(event.personIds.length > 0 || event.placeIds.length > 0) && (
                  <p className="mt-2 text-xs text-ink-faint dark:text-parchment/50">
                    {event.personIds.length > 0 && <>People: {event.personIds.map(personName).join(', ')}</>}
                    {event.personIds.length > 0 && event.placeIds.length > 0 && ' · '}
                    {event.placeIds.length > 0 && <>Places: {event.placeIds.map(placeName).join(', ')}</>}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <EventSourceLink event={event} />
                  {isSaved && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void deleteEvent(event)}
                      aria-label={`Delete ${event.title}`}
                    >
                      Delete
                    </Button>
                  )}
                  {!isSaved && <span className="text-xs text-ink-faint dark:text-parchment/50">Added {formatRelativeTime(event.createdAt)}</span>}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add a timeline event" wide>
        <form onSubmit={(e) => void submitEvent(e)} className="space-y-4">
          <Field label="Title" htmlFor="event-title">
            <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. The mill burns" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Era (free text)" hint="e.g. “late 14th century” or “around 1410”" htmlFor="event-era">
              <Input id="event-era" value={era} onChange={(e) => setEra(e.target.value)} required placeholder="late 14th century" />
            </Field>
            <Field label="Sort year (optional)" hint="A 4-digit year for ordering. Blank keeps entry order." htmlFor="event-year">
              <Input id="event-year" type="number" value={sortYear} onChange={(e) => setSortYear(e.target.value)} placeholder="1410" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vampire age at the time (optional)" htmlFor="event-age">
              <Input id="event-age" type="number" min={0} value={age} onChange={(e) => setAge(e.target.value)} />
            </Field>
            <Field label="Location (optional)" htmlFor="event-location">
              <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dunmere" />
            </Field>
          </div>
          <Field label="Kind" htmlFor="event-kind">
            <Select id="event-kind" value={eventType} onChange={(e) => setEventType(e.target.value as 'historical' | 'custom')}>
              <option value="historical">Historical event</option>
              <option value="custom">Custom event</option>
            </Select>
          </Field>
          <Field label="Description" htmlFor="event-description">
            <Textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Linked people" htmlFor="event-people">
              <select
                id="event-people"
                multiple
                size={Math.min(4, Math.max(2, people.length))}
                value={linkPersonIds}
                onChange={(e) => setLinkPersonIds([...e.target.selectedOptions].map((o) => o.value))}
                className="w-full rounded-md border border-ink/25 bg-white/70 px-3 py-2 text-sm dark:border-parchment/25 dark:bg-charcoal-card dark:text-parchment"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Linked places" htmlFor="event-places">
              <select
                id="event-places"
                multiple
                size={Math.min(4, Math.max(2, places.length))}
                value={linkPlaceIds}
                onChange={(e) => setLinkPlaceIds([...e.target.selectedOptions].map((o) => o.value))}
                className="w-full rounded-md border border-ink/25 bg-white/70 px-3 py-2 text-sm dark:border-parchment/25 dark:bg-charcoal-card dark:text-parchment"
              >
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || !era.trim()}>
              Add to timeline
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
