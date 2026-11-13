// Timeline (Stream C) — pure functions over TimelineEvent rows.
//
// Dates in this app are free text ("late 14th century", "around 1410").
// A TimelineEvent carries the era string for display plus an optional
// numeric `sortYear` (null when the date is approximate or unknown).
// Sorting NEVER crashes on vague labels: dated events come first by
// sortYear, then undated/approximate ones in entry order.

import { newId, nowIso } from '../db/types'
import type {
  CharacterStateChange,
  Chronicle,
  JournalEntry,
  Memory,
  TimelineEvent,
  TimelineEvent as TimelineEventType,
} from '../db/types'
import { parseYear, vampireAgeAtYear } from './age'

export type TimelineFilter = {
  type?: TimelineEventType['type'] | 'all'
  /** Case-insensitive substring match against the era text. */
  eraQuery?: string
  /** Only events linked to this person. */
  personId?: string | null
}

/**
 * Sort for display. Dated events first, ascending by sortYear (ties keep
 * entry order); then undated/approximate events in entry order (createdAt,
 * then title as a final stable tiebreak). Input is never mutated.
 */
export function sortTimelineEvents(events: readonly TimelineEvent[]): TimelineEvent[] {
  const withIndex = events.map((event, index) => ({ event, index }))
  withIndex.sort((a, b) => {
    const aYear = a.event.sortYear ?? null
    const bYear = b.event.sortYear ?? null
    if (aYear !== null && bYear !== null && aYear !== bYear) return aYear - bYear
    if (aYear !== null && bYear === null) return -1
    if (aYear === null && bYear !== null) return 1
    // Both dated with the same year, or both undated: entry order.
    const byCreated = a.event.createdAt.localeCompare(b.event.createdAt)
    if (byCreated !== 0) return byCreated
    const byTitle = a.event.title.localeCompare(b.event.title)
    if (byTitle !== 0) return byTitle
    return a.index - b.index
  })
  return withIndex.map(({ event }) => event)
}

/** Filter a (usually already sorted) list by type, era text, and person. */
export function filterTimelineEvents(
  events: readonly TimelineEvent[],
  filter: TimelineFilter,
): TimelineEvent[] {
  const eraQuery = filter.eraQuery?.trim().toLowerCase()
  return events.filter((event) => {
    if (filter.type && filter.type !== 'all' && event.type !== filter.type) return false
    if (eraQuery && !event.era.toLowerCase().includes(eraQuery)) return false
    if (filter.personId && !event.personIds.includes(filter.personId)) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Custom-event metadata: age + location in the description
// ---------------------------------------------------------------------------
//
// TimelineEvent has no dedicated age/location fields, so a custom event
// stores them as plain leading lines in its description:
//
//   Age: 342
//   Location: Venice
//
//   The body text…
//
// parseEventMeta reads those lines back out; the page shows them as their
// own fields and the body without them. Derived events (journal/memory)
// get age/location from their source record instead.

export interface EventMeta {
  age: number | null
  location: string | null
  body: string
}

const META_LINE_RE = /^(Age|Location):\s*(.+?)\s*$/im

export function parseEventMeta(description: string | undefined): EventMeta {
  if (!description) return { age: null, location: null, body: '' }
  let age: number | null = null
  let location: string | null = null
  const bodyLines: string[] = []
  for (const line of description.split('\n')) {
    const m = META_LINE_RE.exec(line)
    if (m && m[1] === 'Age') {
      const parsed = Number(m[2])
      if (Number.isInteger(parsed) && parsed >= 0) age = parsed
      continue
    }
    if (m && m[1] === 'Location') {
      location = m[2]
      continue
    }
    bodyLines.push(line)
  }
  return { age, location, body: bodyLines.join('\n').trim() }
}

/** Compose a description from a body plus optional age/location lines. */
export function composeEventDescription(body: string, meta: { age?: number | null; location?: string | null }): string {
  const lines: string[] = []
  if (meta.age !== null && meta.age !== undefined) lines.push(`Age: ${meta.age}`)
  if (meta.location) lines.push(`Location: ${meta.location}`)
  const trimmed = body.trim()
  if (lines.length > 0 && trimmed) lines.push('', trimmed)
  else if (trimmed) lines.push(trimmed)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Deriving timeline events from the rest of the record
// ---------------------------------------------------------------------------

export interface DerivedEventInput {
  entries: readonly JournalEntry[]
  memories: readonly Memory[]
  stateChanges: readonly CharacterStateChange[]
}

/**
 * Build read-only timeline rows from journal entries, memories, and
 * skill/resource changes. Derived rows carry sourceId + type so the page
 * can link back; they are NOT saved to the timelineEvents table (the
 * Timeline page merges them with saved custom/historical events in memory),
 * so deleting a journal entry never leaves a stale timeline row behind.
 */
export function deriveTimelineEvents(input: DerivedEventInput): TimelineEvent[] {
  const derived: TimelineEvent[] = []
  for (const entry of input.entries) {
    derived.push({
      id: `derived:journal:${entry.id}`,
      chronicleId: entry.chronicleId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      title: entry.title,
      description: entry.body,
      era: entry.era,
      sortYear: parseYear(entry.era),
      type: 'journal',
      sourceId: entry.id,
      personIds: entry.personIds,
      placeIds: entry.placeIds,
    })
  }
  for (const memory of input.memories) {
    const era = memory.occurredEra ?? memory.recordedEra ?? ''
    derived.push({
      id: `derived:memory:${memory.id}`,
      chronicleId: memory.chronicleId,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      title: memory.title,
      description: memory.text,
      era,
      sortYear: parseYear(era),
      type: 'memory',
      sourceId: memory.id,
      personIds: memory.personIds,
      placeIds: memory.placeIds,
    })
  }
  for (const change of input.stateChanges) {
    if (change.kind !== 'skill' && change.kind !== 'resource') continue
    const label =
      change.kind === 'skill'
        ? `Skill ${change.field === 'created' ? 'added' : 'changed'}: ${change.newValue ?? change.recordId ?? ''}`
        : `Resource ${change.field === 'created' ? 'added' : 'changed'}: ${change.newValue ?? change.recordId ?? ''}`
    derived.push({
      id: `derived:change:${change.id}`,
      chronicleId: change.chronicleId,
      createdAt: change.createdAt,
      updatedAt: change.updatedAt,
      title: label.trim(),
      description: change.note ?? undefined,
      era: '',
      sortYear: null,
      type: change.kind,
      sourceId: change.recordId ?? change.journalEntryId ?? null,
      personIds: [],
      placeIds: [],
    })
  }
  return derived
}

/**
 * The vampire's age at an event, when it can be honestly derived: from the
 * chronicle's starting age/era and the event's numeric sortYear. Returns
 * null for undated events or unparseable starting eras — the page then
 * shows no age rather than a guessed one.
 */
export function eventVampireAge(event: TimelineEvent, chronicle: Chronicle): number | null {
  return vampireAgeAtYear(chronicle.startingAge, chronicle.startingEra, event.sortYear)
}

// ---------------------------------------------------------------------------
// Saving a custom / historical event
// ---------------------------------------------------------------------------

export interface NewTimelineEventInput {
  title: string
  era: string
  /** Explicit numeric year for sorting; defaults to a 4-digit year parsed from the era. */
  sortYear?: number | null
  type: 'historical' | 'custom'
  description?: string
  age?: number | null
  location?: string | null
  personIds?: string[]
  placeIds?: string[]
}

/** Build a saved TimelineEvent row (not yet persisted) from the form input. */
export function makeTimelineEvent(chronicleId: string, input: NewTimelineEventInput): TimelineEvent {
  const now = nowIso()
  return {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    title: input.title.trim(),
    description: composeEventDescription(input.description ?? '', {
      age: input.age ?? null,
      location: input.location ?? null,
    }),
    era: input.era.trim(),
    sortYear: input.sortYear ?? parseYear(input.era),
    type: input.type,
    sourceId: null,
    personIds: input.personIds ?? [],
    placeIds: input.placeIds ?? [],
  }
}
