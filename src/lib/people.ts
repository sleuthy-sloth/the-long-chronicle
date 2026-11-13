// People & places data access (Stream C).
//
// People and places are free-form records about a very long life: names,
// descriptions, eras as free text, and a status that is a plain string so
// the player can write anything ("Alive", "Dead", "Missing", "Unknown",
// "Undead", or their own wording). Writes go through the shared Zod
// schemas in src/db/validation.ts; reads never validate, so older rows
// stay readable.
import { db } from './localDb'
import { validateEntity } from '../db/validation'
import { newId, nowIso } from '../db/types'
import type { Person, Place, Relationship } from '../db/types'

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const PERSON_STATUSES = ['Alive', 'Dead', 'Missing', 'Unknown', 'Undead'] as const

export async function listPeople(chronicleId: string): Promise<Person[]> {
  const rows = await db.people.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPerson(id: string): Promise<Person | undefined> {
  return db.people.get(id)
}

export interface NewPersonInput {
  name: string
  description?: string
  firstAppearance?: string
  lastKnownEra?: string
  relationship?: string
  wants?: string
  /** Free text — the standard statuses are suggestions, not a closed list. */
  status?: string
  notes?: string
}

export async function createPerson(chronicleId: string, input: NewPersonInput): Promise<Person> {
  const now = nowIso()
  const person = validateEntity('people', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    name: input.name.trim(),
    description: clean(input.description),
    firstAppearance: clean(input.firstAppearance),
    lastKnownEra: clean(input.lastKnownEra),
    relationship: clean(input.relationship),
    wants: clean(input.wants),
    status: clean(input.status) ?? 'Unknown',
    notes: clean(input.notes),
    memoryIds: [],
    journalEntryIds: [],
  })
  await db.people.put(person)
  return person
}

export async function updatePerson(id: string, patch: Partial<Person>): Promise<Person> {
  const existing = await db.people.get(id)
  if (!existing) throw new Error(`Person not found: ${id}`)
  const next = validateEntity('people', { ...existing, ...patch, id: existing.id, updatedAt: nowIso() })
  await db.people.put(next)
  return next
}

export async function deletePerson(id: string): Promise<void> {
  await db.people.delete(id)
  // Relationship-history notes belong to the person; remove them too.
  await db.relationships.where('personId').equals(id).delete()
}

/** Journal entries + memories that name this person (by either direction of the link). */
export async function linkedRecordsForPerson(personId: string): Promise<{ entryIds: string[]; memoryIds: string[] }> {
  // personIds is an array field without a Dexie index, so filter() scans
  // in memory — correct for a local archive of this size.
  const [entries, memories, person] = await Promise.all([
    db.journalEntries.filter((e) => e.personIds.includes(personId)).toArray(),
    db.memories.filter((m) => m.personIds.includes(personId)).toArray(),
    db.people.get(personId),
  ])
  const entryIds = new Set(entries.map((e) => e.id))
  const memoryIds = new Set(memories.map((m) => m.id))
  for (const id of person?.journalEntryIds ?? []) entryIds.add(id)
  for (const id of person?.memoryIds ?? []) memoryIds.add(id)
  return { entryIds: [...entryIds], memoryIds: [...memoryIds] }
}

// ---------------------------------------------------------------------------
// Relationship history (dated notes about one person)
// ---------------------------------------------------------------------------

export async function listRelationships(personId: string): Promise<Relationship[]> {
  const rows = await db.relationships.where('personId').equals(personId).toArray()
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function addRelationshipNote(
  chronicleId: string,
  personId: string,
  input: { description: string; era: string },
): Promise<Relationship> {
  const now = nowIso()
  const row = validateEntity('relationships', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    personId,
    description: input.description.trim(),
    era: input.era.trim(),
  })
  await db.relationships.put(row)
  return row
}

export async function deleteRelationshipNote(id: string): Promise<void> {
  await db.relationships.delete(id)
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export async function listPlaces(chronicleId: string): Promise<Place[]> {
  const rows = await db.places.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPlace(id: string): Promise<Place | undefined> {
  return db.places.get(id)
}

export interface NewPlaceInput {
  name: string
  description?: string
  region?: string
  firstVisit?: string
  lastVisit?: string
  significance?: string
}

export async function createPlace(chronicleId: string, input: NewPlaceInput): Promise<Place> {
  const now = nowIso()
  const place = validateEntity('places', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    name: input.name.trim(),
    description: clean(input.description),
    region: clean(input.region),
    firstVisit: clean(input.firstVisit),
    lastVisit: clean(input.lastVisit),
    significance: clean(input.significance),
    personIds: [],
    memoryIds: [],
    journalEntryIds: [],
  })
  await db.places.put(place)
  return place
}

export async function updatePlace(id: string, patch: Partial<Place>): Promise<Place> {
  const existing = await db.places.get(id)
  if (!existing) throw new Error(`Place not found: ${id}`)
  const next = validateEntity('places', { ...existing, ...patch, id: existing.id, updatedAt: nowIso() })
  await db.places.put(next)
  return next
}

export async function deletePlace(id: string): Promise<void> {
  await db.places.delete(id)
}

/**
 * Everything tied to a place: entries and memories that name it, plus
 * people linked to it — so a place stays followable across long time
 * jumps. Entries are returned oldest-first by entry number when known.
 */
export async function linkedRecordsForPlace(placeId: string): Promise<{
  entryIds: string[]
  memoryIds: string[]
  personIds: string[]
}> {
  // placeIds / personIds are array fields without Dexie indexes, so
  // filter() scans in memory — correct for a local archive of this size.
  const [entries, memories, place] = await Promise.all([
    db.journalEntries.filter((e) => e.placeIds.includes(placeId)).toArray(),
    db.memories.filter((m) => m.placeIds.includes(placeId)).toArray(),
    db.places.get(placeId),
  ])
  const entryIds = new Set(entries.map((e) => e.id))
  const memoryIds = new Set(memories.map((m) => m.id))
  const personIds = new Set<string>()
  for (const id of place?.journalEntryIds ?? []) entryIds.add(id)
  for (const id of place?.memoryIds ?? []) memoryIds.add(id)
  for (const id of place?.personIds ?? []) personIds.add(id)
  for (const entry of entries) for (const id of entry.personIds) personIds.add(id)
  return { entryIds: [...entryIds], memoryIds: [...memoryIds], personIds: [...personIds] }
}
