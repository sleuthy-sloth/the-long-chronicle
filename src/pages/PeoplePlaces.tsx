// People & Places directory (Stream C).
//
// Two lists under one roof: everyone the vampire has known, and everywhere
// they have been. The tab follows the route — /people or /places — so a
// link always lands on the right list. Detail pages live at
// /people/:personId and /places/:placeId.
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppStore } from '../state/store'
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { useLiveList } from '../lib/live'
import { PERSON_STATUSES, createPerson, createPlace, listPeople, listPlaces } from '../lib/people'
import { pluralize } from '../lib/utils'

export default function PeoplePlaces() {
  const location = useLocation()
  const tab = location.pathname.startsWith('/places') ? 'places' : 'people'
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const chronicleId = activeChronicle?.id ?? null
  const people = useLiveList(() => (chronicleId ? listPeople(chronicleId) : Promise.resolve([])), [chronicleId])
  const places = useLiveList(() => (chronicleId ? listPlaces(chronicleId) : Promise.resolve([])), [chronicleId])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [personFormOpen, setPersonFormOpen] = useState(false)
  const [placeFormOpen, setPlaceFormOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [personName, setPersonName] = useState('')
  const [personStatus, setPersonStatus] = useState('Unknown')
  const [personRelationship, setPersonRelationship] = useState('')
  const [personFirst, setPersonFirst] = useState('')
  const [personDescription, setPersonDescription] = useState('')

  const [placeName, setPlaceName] = useState('')
  const [placeRegion, setPlaceRegion] = useState('')
  const [placeFirst, setPlaceFirst] = useState('')
  const [placeDescription, setPlaceDescription] = useState('')

  if (!activeChronicle) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold">People &amp; Places</h1>
        <EmptyState title="No chronicle yet" action={<Link to="/chronicles" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Chronicles</Link>}>
          <p>Start a chronicle first — people and places belong to one vampire&rsquo;s story.</p>
        </EmptyState>
      </div>
    )
  }

  const query = search.trim().toLowerCase()
  const filteredPeople = (people ?? []).filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false
    if (query && !`${p.name} ${p.description ?? ''} ${p.relationship ?? ''}`.toLowerCase().includes(query)) return false
    return true
  })
  const filteredPlaces = (places ?? []).filter((p) => {
    if (query && !`${p.name} ${p.description ?? ''} ${p.region ?? ''}`.toLowerCase().includes(query)) return false
    return true
  })

  async function submitPerson(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicleId || !personName.trim()) return
    const person = await createPerson(chronicleId, {
      name: personName,
      status: personStatus,
      relationship: personRelationship || undefined,
      firstAppearance: personFirst || undefined,
      description: personDescription || undefined,
    })
    setPersonName('')
    setPersonStatus('Unknown')
    setPersonRelationship('')
    setPersonFirst('')
    setPersonDescription('')
    setPersonFormOpen(false)
    setMessage(`“${person.name}” added to the people directory.`)
  }

  async function submitPlace(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicleId || !placeName.trim()) return
    const place = await createPlace(chronicleId, {
      name: placeName,
      region: placeRegion || undefined,
      firstVisit: placeFirst || undefined,
      description: placeDescription || undefined,
    })
    setPlaceName('')
    setPlaceRegion('')
    setPlaceFirst('')
    setPlaceDescription('')
    setPlaceFormOpen(false)
    setMessage(`“${place.name}” added to the places directory.`)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 font-serif text-3xl font-bold">People &amp; Places</h1>
          <p className="text-sm text-ink-soft dark:text-parchment/70">
            Everyone {activeChronicle.vampireName} has known, and everywhere they have been — across centuries,
            in one place.
          </p>
        </div>
        {tab === 'people' ? (
          <Button onClick={() => setPersonFormOpen(true)}>Add person…</Button>
        ) : (
          <Button onClick={() => setPlaceFormOpen(true)}>Add place…</Button>
        )}
      </div>

      <div role="tablist" aria-label="Directory" className="mb-4 flex gap-1 border-b border-ink/15 dark:border-parchment/15">
        <Link
          role="tab"
          aria-selected={tab === 'people'}
          to="/people"
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === 'people' ? 'bg-parchment-card text-oxblood dark:bg-charcoal-card dark:text-gold-light' : 'text-ink-soft dark:text-parchment/70'}`}
        >
          People ({(people ?? []).length})
        </Link>
        <Link
          role="tab"
          aria-selected={tab === 'places'}
          to="/places"
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === 'places' ? 'bg-parchment-card text-oxblood dark:bg-charcoal-card dark:text-gold-light' : 'text-ink-soft dark:text-parchment/70'}`}
        >
          Places ({(places ?? []).length})
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Search" htmlFor="directory-search">
          <Input id="directory-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, description, region…" className="w-64" />
        </Field>
        {tab === 'people' && (
          <Field label="Status" htmlFor="directory-status">
            <Select id="directory-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
              <option value="">Any status</option>
              {PERSON_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {message && (
        <p role="status" className="mb-4 rounded-md bg-gold/15 px-3 py-2 text-sm dark:bg-gold/20">
          {message}
        </p>
      )}

      {tab === 'people' ? (
        filteredPeople.length === 0 ? (
          <EmptyState title="No one recorded yet">
            <p>Add the first person {activeChronicle.vampireName} met — a name, a status, and what they wanted is enough to start.</p>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {filteredPeople.map((p) => (
              <li key={p.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={`/people/${p.id}`} className="font-serif text-xl font-semibold text-oxblood underline-offset-2 hover:underline dark:text-gold-light">
                    {p.name}
                  </Link>
                  <Badge tone={p.status === 'Alive' ? 'gold' : p.status === 'Dead' ? 'oxblood' : 'default'}>{p.status}</Badge>
                </div>
                {p.relationship && <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">Relationship: {p.relationship}</p>}
                {p.description && <p className="mt-1 text-sm leading-relaxed">{p.description}</p>}
                <p className="mt-2 text-xs text-ink-faint dark:text-parchment/50">
                  {p.firstAppearance ? `First seen: ${p.firstAppearance}` : 'First appearance not recorded'}
                  {p.lastKnownEra ? ` · Last known: ${p.lastKnownEra}` : ''}
                  {p.wants ? ` · Wants: ${p.wants}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : filteredPlaces.length === 0 ? (
        <EmptyState title="Nowhere recorded yet">
          <p>Add the first place — a town, a house, a stretch of road — and when the vampire first set foot there.</p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {filteredPlaces.map((p) => (
            <li key={p.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link to={`/places/${p.id}`} className="font-serif text-xl font-semibold text-oxblood underline-offset-2 hover:underline dark:text-gold-light">
                  {p.name}
                </Link>
                {p.region && <Badge tone="gold">{p.region}</Badge>}
              </div>
              {p.description && <p className="mt-1 text-sm leading-relaxed">{p.description}</p>}
              <p className="mt-2 text-xs text-ink-faint dark:text-parchment/50">
                {p.firstVisit ? `First visit: ${p.firstVisit}` : 'First visit not recorded'}
                {p.lastVisit ? ` · Last visit: ${p.lastVisit}` : ''}
                {p.significance ? ` · ${p.significance}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-ink-faint dark:text-parchment/50">
        {tab === 'people'
          ? `${pluralize(filteredPeople.length, 'person')} shown. Status is free text — Alive, Dead, Missing, Unknown, Undead, or your own wording.`
          : `${pluralize(filteredPlaces.length, 'place')} shown.`}
      </p>

      <Modal open={personFormOpen} onClose={() => setPersonFormOpen(false)} title="Add a person">
        <form onSubmit={(e) => void submitPerson(e)} className="space-y-4">
          <Field label="Name" htmlFor="person-name">
            <Input id="person-name" value={personName} onChange={(e) => setPersonName(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="person-status">
              <Select id="person-status" value={personStatus} onChange={(e) => setPersonStatus(e.target.value)}>
                {PERSON_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Relationship to the vampire" htmlFor="person-relationship">
              <Input id="person-relationship" value={personRelationship} onChange={(e) => setPersonRelationship(e.target.value)} placeholder="e.g. Debtor, lover, rival" />
            </Field>
          </div>
          <Field label="First appearance (era)" htmlFor="person-first">
            <Input id="person-first" value={personFirst} onChange={(e) => setPersonFirst(e.target.value)} placeholder="e.g. late 14th century" />
          </Field>
          <Field label="Description" htmlFor="person-description">
            <Textarea id="person-description" value={personDescription} onChange={(e) => setPersonDescription(e.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPersonFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!personName.trim()}>
              Add person
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={placeFormOpen} onClose={() => setPlaceFormOpen(false)} title="Add a place">
        <form onSubmit={(e) => void submitPlace(e)} className="space-y-4">
          <Field label="Name" htmlFor="place-name">
            <Input id="place-name" value={placeName} onChange={(e) => setPlaceName(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Region / country" htmlFor="place-region">
              <Input id="place-region" value={placeRegion} onChange={(e) => setPlaceRegion(e.target.value)} placeholder="e.g. Dunmere, the coast road" />
            </Field>
            <Field label="First visit (era)" htmlFor="place-first">
              <Input id="place-first" value={placeFirst} onChange={(e) => setPlaceFirst(e.target.value)} placeholder="e.g. early 15th century" />
            </Field>
          </div>
          <Field label="Description" htmlFor="place-description">
            <Textarea id="place-description" value={placeDescription} onChange={(e) => setPlaceDescription(e.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlaceFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!placeName.trim()}>
              Add place
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
