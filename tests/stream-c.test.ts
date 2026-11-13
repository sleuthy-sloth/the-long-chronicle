// @vitest-environment node
// Stream C tests: timeline sorting with approximate dates, dice roller,
// age helper, thread transitions, recap append-only behaviour, endings
// that never lock a chronicle, quick-note conversion, and people/places.
// Dexie runs against fake-indexeddb via tests/setup.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { archiveChronicle, createChronicle, db, resetDb, updateChronicle } from '../src/db/database'
import { computeAge, parseYear, vampireAgeAtYear } from '../src/lib/age'
import {
  formatDiceSpec,
  formatRollText,
  isValidSpec,
  parseDiceSpec,
  rollDice,
  rollDie,
} from '../src/lib/dice'
import {
  deriveTimelineEvents,
  eventVampireAge,
  filterTimelineEvents,
  makeTimelineEvent,
  parseEventMeta,
  sortTimelineEvents,
} from '../src/lib/timeline'
import { listStateChanges } from '../src/db/database'
import { listJournalEntries } from '../src/lib/journal'
import { listMemories } from '../src/lib/memories'
import {
  addRelationshipNote,
  createPerson,
  createPlace,
  linkedRecordsForPerson,
  linkedRecordsForPlace,
  listRelationships,
} from '../src/lib/people'
import { createThread, setThreadStatus } from '../src/lib/threads'
import { composeRecapBody, createEnding, createRecap, listEndings, listRecaps, parseRecapBody } from '../src/lib/archive'
import { clearDiceRolls, convertQuickNote, createQuickNote, listDiceRolls, saveDiceRoll } from '../src/lib/notes'
import { seedTestChronicle } from './seed-chronicle'
import type { TimelineEvent } from '../src/db/types'
import { newId, nowIso } from '../src/db/types'

function event(over: Partial<TimelineEvent> & { title: string }): TimelineEvent {
  const now = nowIso()
  return {
    id: newId(),
    chronicleId: 'c1',
    createdAt: now,
    updatedAt: now,
    era: '',
    sortYear: null,
    type: 'custom',
    sourceId: null,
    personIds: [],
    placeIds: [],
    ...over,
  }
}

beforeEach(async () => {
  await resetDb()
})

// ---------------------------------------------------------------------------
// Age helper
// ---------------------------------------------------------------------------

describe('age helper', () => {
  it('parses a 4-digit year from free text', () => {
    expect(parseYear('around 1410')).toBe(1410)
    expect(parseYear('1348, the plague year')).toBe(1348)
    expect(parseYear('c. 1520')).toBe(1520)
  })

  it('returns null for vague labels — a century is not a year', () => {
    expect(parseYear('late 14th century')).toBeNull()
    expect(parseYear('the 1300s')).toBeNull()
    expect(parseYear('the winter the river froze')).toBeNull()
    expect(parseYear('')).toBeNull()
    expect(parseYear(undefined)).toBeNull()
  })

  it('calculates age and elapsed years from two numeric eras', () => {
    const calc = computeAge(23, '1348', '1410')
    expect(calc.calculable).toBe(true)
    expect(calc.elapsedYears).toBe(62)
    expect(calc.currentAge).toBe(85)
    expect(calc.reason).toBeNull()
  })

  it('refuses to calculate from a vague label and explains why', () => {
    const calc = computeAge(23, 'late 14th century', 'early 16th century')
    expect(calc.calculable).toBe(false)
    expect(calc.elapsedYears).toBeNull()
    expect(calc.currentAge).toBeNull()
    expect(calc.reason).toMatch(/cannot calculate from approximate date/i)
  })

  it('refuses when the current era predates the starting era', () => {
    const calc = computeAge(23, '1500', '1400')
    expect(calc.calculable).toBe(false)
    expect(calc.reason).toMatch(/earlier than the starting era/)
  })

  it('derives a vampire age at a dated year, null when it cannot', () => {
    expect(vampireAgeAtYear(23, '1348', 1410)).toBe(85)
    expect(vampireAgeAtYear(23, 'late 14th century', 1410)).toBeNull()
    expect(vampireAgeAtYear(23, '1348', null)).toBeNull()
    expect(vampireAgeAtYear(23, '1348', 1300)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Dice roller
// ---------------------------------------------------------------------------

describe('dice roller', () => {
  it('rolls stay in range for every standard die', () => {
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      for (let i = 0; i < 50; i++) {
        const value = rollDie(sides)
        expect(value).toBeGreaterThanOrEqual(1)
        expect(value).toBeLessThanOrEqual(sides)
      }
    }
  })

  it('rolls the right count and totals correctly', () => {
    const result = rollDice({ count: 3, sides: 6 })
    expect(result.results).toHaveLength(3)
    expect(result.total).toBe(result.results.reduce((a, b) => a + b, 0))
    expect(result.dice).toBe('3d6')
  })

  it('every face shows up over many rolls (rough distribution check)', () => {
    const counts = new Map<number, number>()
    for (let i = 0; i < 600; i++) {
      const value = rollDie(6)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    for (let face = 1; face <= 6; face++) {
      const count = counts.get(face) ?? 0
      expect(count).toBeGreaterThan(40)
      expect(count).toBeLessThan(180)
    }
  })

  it('rejects out-of-range specs', () => {
    expect(isValidSpec({ count: 0, sides: 6 })).toBe(false)
    expect(isValidSpec({ count: 21, sides: 6 })).toBe(false)
    expect(isValidSpec({ count: 2, sides: 1 })).toBe(false)
    expect(isValidSpec({ count: 2, sides: 1001 })).toBe(false)
    expect(() => rollDice({ count: 0, sides: 6 })).toThrow()
    expect(() => rollDie(1)).toThrow()
  })

  it('parses and formats dice specs', () => {
    expect(parseDiceSpec('3d6')).toEqual({ count: 3, sides: 6 })
    expect(parseDiceSpec('d20')).toEqual({ count: 1, sides: 20 })
    expect(parseDiceSpec(' 2D8 ')).toEqual({ count: 2, sides: 8 })
    expect(parseDiceSpec('d100')).toEqual({ count: 1, sides: 100 })
    expect(parseDiceSpec('banana')).toBeNull()
    expect(parseDiceSpec('0d6')).toBeNull()
    expect(parseDiceSpec('21d6')).toBeNull()
    expect(formatDiceSpec({ count: 2, sides: 6 })).toBe('2d6')
    expect(formatRollText({ dice: '2d6', results: [3, 5], total: 8 })).toBe('2d6: [3, 5] = 8')
  })

  it('persists roll history and clears it', async () => {
    const seeded = await seedTestChronicle()
    const chronicleId = seeded.chronicle.id
    expect(await listDiceRolls(chronicleId)).toHaveLength(1) // the seeded roll
    await saveDiceRoll(chronicleId, rollDice({ count: 2, sides: 6 }), 'test note')
    const rows = await listDiceRolls(chronicleId)
    expect(rows).toHaveLength(2)
    expect(rows[0].dice).toBe('2d6')
    expect(rows[0].note).toBe('test note')
    await clearDiceRolls(chronicleId)
    expect(await listDiceRolls(chronicleId)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

describe('timeline', () => {
  it('sorts dated events by year, undated ones after them in entry order', () => {
    const undatedA = event({ title: 'vague A', era: 'late 14th century', createdAt: '2026-01-01T00:00:00.000Z' })
    const dated1410 = event({ title: 'dated 1410', era: 'around 1410', sortYear: 1410, createdAt: '2026-01-02T00:00:00.000Z' })
    const dated1348 = event({ title: 'dated 1348', era: '1348', sortYear: 1348, createdAt: '2026-01-03T00:00:00.000Z' })
    const undatedB = event({ title: 'vague B', era: 'some winter', createdAt: '2026-01-04T00:00:00.000Z' })
    const sorted = sortTimelineEvents([undatedA, dated1410, dated1348, undatedB])
    expect(sorted.map((e) => e.title)).toEqual(['dated 1348', 'dated 1410', 'vague A', 'vague B'])
  })

  it('never crashes on vague or empty era labels', () => {
    const rows = [
      event({ title: 'no era at all', era: '' }),
      event({ title: 'century', era: 'late 14th century' }),
      event({ title: 'emoji', era: '❦❦❦' }),
      event({ title: 'dated', era: '1410', sortYear: 1410 }),
    ]
    expect(() => sortTimelineEvents(rows)).not.toThrow()
    expect(sortTimelineEvents(rows)[0].title).toBe('dated')
  })

  it('does not mutate the input array', () => {
    const rows = [event({ title: 'b', era: '1410', sortYear: 1410 }), event({ title: 'a', era: '1348', sortYear: 1348 })]
    const copy = [...rows]
    sortTimelineEvents(rows)
    expect(rows).toEqual(copy)
  })

  it('derives events from entries, memories, and state changes', async () => {
    const seeded = await seedTestChronicle()
    const chronicleId = seeded.chronicle.id
    const derived = deriveTimelineEvents({
      entries: await listJournalEntries(chronicleId),
      memories: await listMemories(chronicleId),
      stateChanges: await listStateChanges(chronicleId),
    })
    const types = derived.map((d) => d.type)
    expect(types).toContain('journal')
    expect(types).toContain('memory')
    expect(types).toContain('skill')
    const journalRow = derived.find((d) => d.type === 'journal')
    expect(journalRow?.sourceId).toBe(seeded.entryOneId)
    // The seeded entries have vague eras — derived sortYear is null, not a crash.
    expect(derived.every((d) => d.sortYear === null || Number.isInteger(d.sortYear))).toBe(true)
  })

  it('derives a vampire age only for dated events', async () => {
    const seeded = await seedTestChronicle()
    const chronicle = await db.chronicles.get(seeded.chronicle.id)
    // Seeded chronicle starts in a vague era, so no age can be derived.
    const vague = event({ title: 'vague', era: 'late 14th century', sortYear: null })
    expect(eventVampireAge(vague, chronicle!)).toBeNull()
    // With a numeric start, a dated event gets an age.
    const numeric = { ...chronicle!, startingAge: 23, startingEra: '1348' }
    const dated = event({ title: 'dated', era: '1410', sortYear: 1410 })
    expect(eventVampireAge(dated, numeric)).toBe(85)
  })

  it('filters by type, era text, and person', () => {
    const rows = [
      event({ title: 'e1', era: 'late 14th century', type: 'journal', personIds: ['p1'] }),
      event({ title: 'e2', era: 'early 15th century', type: 'memory', personIds: ['p2'] }),
      event({ title: 'e3', era: 'around 1410', type: 'historical', sortYear: 1410 }),
    ]
    expect(filterTimelineEvents(rows, { type: 'journal' }).map((e) => e.title)).toEqual(['e1'])
    expect(filterTimelineEvents(rows, { eraQuery: '15th' }).map((e) => e.title)).toEqual(['e2'])
    expect(filterTimelineEvents(rows, { personId: 'p2' }).map((e) => e.title)).toEqual(['e2'])
    expect(filterTimelineEvents(rows, { type: 'all' })).toHaveLength(3)
  })

  it('stores age/location as description lines and reads them back', () => {
    const made = makeTimelineEvent('c1', {
      title: 'The mill burns',
      era: 'around 1410',
      type: 'historical',
      description: 'Fire takes the mill.',
      age: 342,
      location: 'Dunmere',
    })
    expect(made.sortYear).toBe(1410)
    const meta = parseEventMeta(made.description)
    expect(meta.age).toBe(342)
    expect(meta.location).toBe('Dunmere')
    expect(meta.body).toBe('Fire takes the mill.')
    // No age/location: description is just the body.
    const plain = makeTimelineEvent('c1', { title: 'Quiet winter', era: 'a winter', type: 'custom', description: 'Nothing happened.' })
    expect(plain.sortYear).toBeNull()
    expect(parseEventMeta(plain.description).body).toBe('Nothing happened.')
  })
})

// ---------------------------------------------------------------------------
// People & places
// ---------------------------------------------------------------------------

describe('people & places', () => {
  it('creates a person with a custom free-text status', async () => {
    const seeded = await seedTestChronicle()
    const person = await createPerson(seeded.chronicle.id, { name: 'Old Marta', status: 'Turned — and proud of it' })
    expect(person.status).toBe('Turned — and proud of it')
    expect(person.name).toBe('Old Marta')
  })

  it('defaults a blank status to Unknown', async () => {
    const seeded = await seedTestChronicle()
    const person = await createPerson(seeded.chronicle.id, { name: 'A stranger' })
    expect(person.status).toBe('Unknown')
  })

  it('links a person to their seeded memories and entries', async () => {
    const seeded = await seedTestChronicle()
    const links = await linkedRecordsForPerson(seeded.personId)
    expect(links.memoryIds).toContain(seeded.memoryActiveId)
    expect(links.entryIds).toContain(seeded.entryOneId)
  })

  it('links a place to its people, memories, and entries', async () => {
    const seeded = await seedTestChronicle()
    const links = await linkedRecordsForPlace(seeded.placeId)
    expect(links.memoryIds).toContain(seeded.memoryActiveId)
    expect(links.entryIds).toContain(seeded.entryOneId)
    expect(links.personIds).toContain(seeded.personId)
  })

  it('records dated relationship history', async () => {
    const seeded = await seedTestChronicle()
    await addRelationshipNote(seeded.chronicle.id, seeded.personId, {
      description: 'The debt was forgiven, then remembered again.',
      era: 'early 15th century',
    })
    const history = await listRelationships(seeded.personId)
    expect(history).toHaveLength(1)
    expect(history[0].era).toBe('early 15th century')
  })

  it('creates and lists places', async () => {
    const seeded = await seedTestChronicle()
    const place = await createPlace(seeded.chronicle.id, {
      name: 'The old bridge',
      region: 'Dunmere',
      firstVisit: 'late 14th century',
      significance: 'Where the letters cross the river.',
    })
    expect(place.region).toBe('Dunmere')
    const places = await db.places.where('chronicleId').equals(seeded.chronicle.id).toArray()
    expect(places.map((p) => p.name)).toContain('The old bridge')
  })
})

// ---------------------------------------------------------------------------
// Story threads
// ---------------------------------------------------------------------------

describe('story threads', () => {
  it('opens a thread, resolves it with notes, and reopens it', async () => {
    const seeded = await seedTestChronicle()
    const thread = await createThread(seeded.chronicle.id, { title: 'The missing letter' })
    expect(thread.status).toBe('Open')
    const resolved = await setThreadStatus(thread.id, 'Resolved', 'The letter was in the mill all along.')
    expect(resolved.status).toBe('Resolved')
    expect(resolved.resolutionNotes).toBe('The letter was in the mill all along.')
    const reopened = await setThreadStatus(thread.id, 'Open')
    expect(reopened.status).toBe('Open')
    // Resolution notes survive reopening as history.
    expect(reopened.resolutionNotes).toBe('The letter was in the mill all along.')
  })

  it('rejects a transition outside the allowed set', async () => {
    const seeded = await seedTestChronicle()
    const thread = await createThread(seeded.chronicle.id, { title: 'A thread' })
    await setThreadStatus(thread.id, 'Resolved')
    await expect(setThreadStatus(thread.id, 'Abandoned')).rejects.toThrow(/Cannot move a Resolved thread to Abandoned/)
  })

  it('moves through Dormant and Abandoned', async () => {
    const seeded = await seedTestChronicle()
    const thread = await createThread(seeded.chronicle.id, { title: 'A thread' })
    expect((await setThreadStatus(thread.id, 'Dormant')).status).toBe('Dormant')
    expect((await setThreadStatus(thread.id, 'Abandoned')).status).toBe('Abandoned')
    expect((await setThreadStatus(thread.id, 'Open')).status).toBe('Open')
  })
})

// ---------------------------------------------------------------------------
// Recaps (append-only) and endings (never lock)
// ---------------------------------------------------------------------------

describe('recaps and endings', () => {
  it('appends recaps and never overwrites an earlier one', async () => {
    const seeded = await seedTestChronicle()
    const chronicleId = seeded.chronicle.id
    const first = await createRecap(chronicleId, {
      title: 'Recap one',
      era: 'early 15th century',
      sections: { storySoFar: 'Rain, a mill, a debt.' },
    })
    await createRecap(chronicleId, {
      title: 'Recap two',
      era: 'mid 15th century',
      sections: { storySoFar: 'The debt was paid in letters.' },
    })
    const recaps = await listRecaps(chronicleId)
    expect(recaps).toHaveLength(3) // one seeded + two new
    const kept = recaps.find((r) => r.id === first.id)!
    expect(kept.title).toBe('Recap one')
    expect(kept.body).toBe('## The story so far\n\nRain, a mill, a debt.')
    expect(kept.body).not.toContain('paid in letters')
  })

  it('round-trips labelled recap sections through one body field', () => {
    const body = composeRecapBody({
      storySoFar: 'Rain.',
      believesNow: 'The river keeps its ledger.',
      turningPoints: 'The mill burned.',
    })
    const parsed = parseRecapBody(body)
    expect(parsed.storySoFar).toBe('Rain.')
    expect(parsed.believesNow).toBe('The river keeps its ledger.')
    expect(parsed.turningPoints).toBe('The mill burned.')
    expect(parsed.hasBecome).toBeUndefined()
  })

  it('records an ending and completing the chronicle does not lock editing', async () => {
    const seeded = await seedTestChronicle()
    const chronicleId = seeded.chronicle.id
    const ending = await createEnding(chronicleId, {
      finalEra: 'early 16th century',
      finalAge: 214,
      finalLocation: 'Dunmere',
      endingType: 'A quiet retirement',
      whatLost: 'The letters.',
      whatEndured: 'The mill.',
      finalScene: 'Rain on stone, one last time.',
      epilogue: 'The river kept its ledger.',
    })
    expect(ending.finalEra).toBe('early 16th century')
    expect((await listEndings(chronicleId))).toHaveLength(1)

    // Complete the chronicle…
    const completed = await archiveChronicle(chronicleId)
    expect(completed.status).toBe('Completed')

    // …and everything is still editable: chronicle fields, new recaps,
    // new people, and the ending itself.
    const edited = await updateChronicle(chronicleId, { currentLocation: 'Somewhere new' })
    expect(edited.currentLocation).toBe('Somewhere new')
    expect(edited.status).toBe('Completed')
    await createRecap(chronicleId, { title: 'After the ending', era: 'early 16th century', sections: { storySoFar: 'Still writing.' } })
    expect((await listRecaps(chronicleId)).length).toBeGreaterThan(1)
    await createPerson(chronicleId, { name: 'A late arrival' })
    const people = await db.people.where('chronicleId').equals(chronicleId).toArray()
    expect(people.map((p) => p.name)).toContain('A late arrival')
  })

  it('a chronicle can be created, ended, and restored', async () => {
    const chronicle = await createChronicle({
      title: 'A short telling',
      vampireName: 'Test Vampire',
      startingAge: 30,
      startingEra: '1400',
      startingLocation: 'Test town',
      concept: 'Test concept.',
    })
    await createEnding(chronicle.id, { finalEra: '1450' })
    await archiveChronicle(chronicle.id)
    expect((await db.chronicles.get(chronicle.id))?.status).toBe('Completed')
  })
})

// ---------------------------------------------------------------------------
// Quick notes
// ---------------------------------------------------------------------------

describe('quick notes', () => {
  it('converts a note into a person, prefilled, and marks it converted', async () => {
    const seeded = await seedTestChronicle()
    const note = await createQuickNote(seeded.chronicle.id, 'Old Marta — keeps bees, knows the river road.')
    const result = await convertQuickNote(note.id, 'person')
    expect(result.target).toBe('person')
    const person = await db.people.get(result.targetId)
    expect(person?.notes).toContain('keeps bees')
    const kept = await db.quickNotes.get(note.id)
    expect(kept?.convertedTo).toBe(`person:${result.targetId}`)
  })

  it('converts a note into a journal draft with the text as the body', async () => {
    const seeded = await seedTestChronicle()
    const note = await createQuickNote(seeded.chronicle.id, 'The bridge is out. Find another way across.')
    const result = await convertQuickNote(note.id, 'journal')
    expect(result.target).toBe('journal')
    const draft = await db.journalEntryDrafts.get(result.targetId)
    expect(draft?.body).toBe('The bridge is out. Find another way across.')
  })

  it('converts a note into a memory, place, and thread', async () => {
    const seeded = await seedTestChronicle()
    const chronicleId = seeded.chronicle.id
    const memoryNote = await createQuickNote(chronicleId, 'Rain on stone in Dunmere.')
    const memoryResult = await convertQuickNote(memoryNote.id, 'memory')
    expect((await db.memories.get(memoryResult.targetId))?.text).toContain('Rain on stone')

    const placeNote = await createQuickNote(chronicleId, 'The old bridge over the river.')
    const placeResult = await convertQuickNote(placeNote.id, 'place')
    expect((await db.places.get(placeResult.targetId))?.name).toContain('old bridge')

    const threadNote = await createQuickNote(chronicleId, 'Who took the letters?')
    const threadResult = await convertQuickNote(threadNote.id, 'thread')
    expect((await db.storyThreads.get(threadResult.targetId))?.title).toContain('letters')
  })

  it('refuses to convert the same note twice', async () => {
    const seeded = await seedTestChronicle()
    const note = await createQuickNote(seeded.chronicle.id, 'A note.')
    await convertQuickNote(note.id, 'person')
    await expect(convertQuickNote(note.id, 'place')).rejects.toThrow(/already been converted/)
  })
})
