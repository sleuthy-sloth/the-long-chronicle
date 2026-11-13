// Stream D test helper — seeds one small chronicle with invented placeholder
// content written for these tests (no rulebook text, no example prompts).
// All sentences below are original sample lines.
import { db } from '../src/lib/localDb'
import type { Chronicle, ID } from '../src/db/types'
import { newId, nowIso } from '../src/db/types'

export interface SeededChronicle {
  chronicle: Chronicle
  memoryActiveId: ID
  memoryLostId: ID
  memoryAlteredId: ID
  entryOneId: ID
  entryTwoId: ID
  personId: ID
  placeId: ID
  threadId: ID
}

export async function seedTestChronicle(): Promise<SeededChronicle> {
  const now = nowIso()
  const chronicleId = newId()
  const chronicle: Chronicle = {
    id: chronicleId,
    chronicleId,
    createdAt: now,
    updatedAt: now,
    title: 'The Ashen Archive',
    vampireName: 'Mireille',
    startingAge: 23,
    currentAge: 214,
    startingEra: 'late 14th century',
    currentEra: 'early 16th century',
    startingLocation: 'Sample town: Dunmere',
    currentLocation: 'Sample town: Dunmere',
    concept: 'Sample concept: a vampire who keeps other people’s letters.',
    status: 'In Progress',
  }
  await db.chronicles.put(chronicle)

  const memoryActiveId = newId()
  const memoryLostId = newId()
  const memoryAlteredId = newId()
  const personId = newId()
  const placeId = newId()
  const threadId = newId()
  const entryOneId = newId()
  const entryTwoId = newId()

  await db.skills.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    name: 'Lockpicking', description: 'Sample skill: opening old locks quietly.', value: 'Experienced',
  })
  await db.resources.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    name: 'A brass key', description: 'Sample resource: a key with no known lock.', quantity: '1',
  })
  await db.characterStateChanges.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    kind: 'skill', field: 'value', oldValue: 'Novice', newValue: 'Experienced',
    note: 'Sample change: practice on the mill door.',
  })

  await db.memories.put({
    id: memoryActiveId, chronicleId, createdAt: now, updatedAt: now,
    code: 'M-001', title: 'Rain on stone', text: 'Sample memory: the smell of rain on stone in Dunmere.',
    status: 'Active', tags: ['rain'], occurredEra: 'late 14th century',
    personIds: [personId], placeIds: [placeId], journalEntryIds: [entryOneId],
  })
  await db.memories.put({
    id: memoryLostId, chronicleId, createdAt: now, updatedAt: now,
    code: 'M-002', title: 'The lost letter', text: 'Sample memory: a letter I can no longer recall.',
    status: 'Lost', tags: [], personIds: [], placeIds: [], journalEntryIds: [],
  })
  await db.memories.put({
    id: memoryAlteredId, chronicleId, createdAt: now, updatedAt: now,
    code: 'M-003', title: 'The miller’s promise', text: 'Sample memory (altered): the miller promised to keep the debt secret.',
    status: 'Altered', tags: ['miller'], occurredEra: 'late 14th century',
    personIds: [personId], placeIds: [], journalEntryIds: [],
  })
  await db.memoryVersions.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    memoryId: memoryAlteredId, version: 1,
    text: 'Sample memory (original): the miller promised to forget the debt.',
    status: 'Active', note: 'Sample version note: the promise changed.',
  })

  await db.people.put({
    id: personId, chronicleId, createdAt: now, updatedAt: now,
    name: 'Anselm the miller', description: 'Sample person: the miller of Dunmere, owed a debt.',
    firstAppearance: 'late 14th century', status: 'Alive', relationship: 'Debtor',
    memoryIds: [memoryActiveId], journalEntryIds: [entryOneId],
  })
  await db.places.put({
    id: placeId, chronicleId, createdAt: now, updatedAt: now,
    name: 'The mill at the river bend', description: 'Sample place: a damp mill where letters are hidden.',
    region: 'Dunmere', memoryIds: [memoryActiveId], personIds: [personId], journalEntryIds: [entryOneId],
  })
  await db.storyThreads.put({
    id: threadId, chronicleId, createdAt: now, updatedAt: now,
    title: 'The debt owed to the miller', description: 'Sample thread: a debt that keeps resurfacing.',
    introducedEra: 'late 14th century', status: 'Open',
    personIds: [personId], placeIds: [placeId], memoryIds: [], journalEntryIds: [entryOneId],
  })

  await db.journalEntries.put({
    id: entryOneId, chronicleId, createdAt: now, updatedAt: now,
    number: 1, title: 'First night in Dunmere', era: 'late 14th century', location: 'Dunmere',
    promptText: 'Sample prompt (invented): what does the rain remind you of?',
    body: 'Sample journal: I arrived in Dunmere as the rain began, and the smell of rain on stone took me back.',
    memoryIds: [memoryActiveId], personIds: [personId], placeIds: [placeId], threadIds: [threadId],
    tags: ['rain'],
  })
  await db.journalEntries.put({
    id: entryTwoId, chronicleId, createdAt: now, updatedAt: now,
    number: 2, title: 'A quiet winter', era: 'early 15th century',
    body: 'Sample journal: a quiet winter with no visitors and no letters.',
    memoryIds: [], personIds: [], placeIds: [], threadIds: [], tags: [],
  })

  await db.timelineEvents.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    title: 'Arrival in Dunmere', description: 'Sample event: arrival during the rain.',
    era: 'late 14th century', type: 'journal', sourceId: entryOneId,
    personIds: [personId], placeIds: [placeId],
  })
  await db.timelineEvents.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    title: 'The mill burns (approximate date)', era: 'around 1410',
    sortYear: 1410, type: 'historical', personIds: [], placeIds: [placeId],
  })

  await db.recaps.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    title: 'Recap: the Dunmere years', era: 'early 15th century',
    body: 'Sample recap: rain, a mill, and a debt that would not stay forgotten.',
  })
  await db.diceRolls.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    dice: '2d6', results: [3, 5], total: 8, note: 'Sample roll.',
  })
  await db.promptNotes.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    text: 'Sample prompt note: the river keeps its own ledger.',
    journalEntryId: entryOneId,
  })
  await db.quickNotes.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    text: 'Sample quick note: check the mill door.',
  })

  return {
    chronicle, memoryActiveId, memoryLostId, memoryAlteredId,
    entryOneId, entryTwoId, personId, placeId, threadId,
  }
}
