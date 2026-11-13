// @vitest-environment node
// Schema v1 → v2 migration test: a database written by the v1 app (no
// lastReviewedAt, no promptNotes.used, no characterSnapshots/attachments
// tables) must open under v2 with every v1 record preserved, the new fields
// backfilled to their defaults, and the new tables usable.
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { APP } from '../src/config/app'
import { DB_NAME, DB_VERSION, db } from '../src/db/database'
import { newId, nowIso } from '../src/db/types'

/** The exact v1 store list — copied from database.ts version(1). */
const V1_STORES: Record<string, string> = {
  chronicles: 'id, chronicleId, status, updatedAt',
  skills: 'id, chronicleId, name, updatedAt',
  resources: 'id, chronicleId, name, updatedAt',
  characterStateChanges: 'id, chronicleId, journalEntryId, kind, recordId, createdAt',
  memories: 'id, chronicleId, code, status, updatedAt',
  memoryVersions: 'id, chronicleId, memoryId, version, createdAt',
  journalEntries: 'id, chronicleId, number, pinned, draft, updatedAt',
  journalEntryDrafts: 'id, chronicleId, entryId, updatedAt',
  timelineEvents: 'id, chronicleId, type, sourceId, createdAt',
  people: 'id, chronicleId, name, updatedAt',
  relationships: 'id, chronicleId, personId, createdAt',
  places: 'id, chronicleId, name, updatedAt',
  storyThreads: 'id, chronicleId, status, updatedAt',
  recaps: 'id, chronicleId, createdAt',
  diceRolls: 'id, chronicleId, createdAt',
  promptNotes: 'id, chronicleId, journalEntryId, createdAt',
  quickNotes: 'id, chronicleId, createdAt',
  endings: 'id, chronicleId, createdAt',
  settings: 'id',
}

beforeEach(async () => {
  await db.delete()
})

/** Write a small v1-shaped database the way the v1 app would have. */
async function seedV1(): Promise<{ chronicleId: string; memoryId: string; promptNoteId: string }> {
  const v1 = new Dexie(DB_NAME)
  v1.version(1).stores(V1_STORES)
  await v1.open()
  const now = nowIso()
  const chronicleId = newId()
  const memoryId = newId()
  const promptNoteId = newId()
  await v1.table('chronicles').put({
    id: chronicleId, chronicleId, createdAt: now, updatedAt: now,
    title: 'Sample chronicle: the miller’s century', vampireName: 'Sample vampire: Anselm',
    startingAge: 120, currentAge: 130, startingEra: 'late 14th century', currentEra: 'early 15th century',
    startingLocation: 'Sample town: Dunmere', currentLocation: 'Sample town: Dunmere',
    concept: 'Sample concept: a miller who remembers the flood.', status: 'In Progress',
  })
  // v1 memory: no lastReviewedAt field at all.
  await v1.table('memories').put({
    id: memoryId, chronicleId, createdAt: now, updatedAt: now,
    code: 'M001', title: 'Sample memory: the flood', text: 'Sample text: the river took the mill.',
    status: 'Active', tags: ['river'], personIds: [], placeIds: [], journalEntryIds: [],
  })
  // v1 prompt note: no used / usedAt fields at all.
  await v1.table('promptNotes').put({
    id: promptNoteId, chronicleId, createdAt: now, updatedAt: now,
    text: 'Sample prompt note: a stranger at the mill door.', era: 'late 14th century',
    journalEntryId: null,
  })
  await v1.table('journalEntries').put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    number: 1, title: 'Sample entry: the flood', era: 'late 14th century', body: 'Sample body: the water came at dusk.',
    memoryIds: [memoryId], personIds: [], placeIds: [], threadIds: [], tags: [],
  })
  await v1.table('skills').put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    name: 'Sample skill: Milling', value: 'Master',
  })
  await v1.close()
  return { chronicleId, memoryId, promptNoteId }
}

describe('schema v1 → v2 migration', () => {
  it('declares version 2 in code and config', () => {
    expect(DB_VERSION).toBe(2)
    expect(APP.schemaVersion).toBe(2)
  })

  it('preserves every v1 record and backfills the new fields', async () => {
    const ids = await seedV1()
    await db.open()

    const chronicle = await db.chronicles.get(ids.chronicleId)
    expect(chronicle?.title).toBe('Sample chronicle: the miller’s century')
    expect(chronicle?.currentAge).toBe(130)

    const memory = await db.memories.get(ids.memoryId)
    expect(memory?.title).toBe('Sample memory: the flood')
    expect(memory?.lastReviewedAt).toBeNull()

    const note = await db.promptNotes.get(ids.promptNoteId)
    expect(note?.text).toContain('stranger at the mill door')
    expect(note?.used).toBe(false)

    expect(await db.journalEntries.count()).toBe(1)
    expect(await db.skills.count()).toBe(1)
  })

  it('exposes the new v2 tables empty and writable', async () => {
    await seedV1()
    await db.open()
    expect(await db.characterSnapshots.count()).toBe(0)
    expect(await db.attachments.count()).toBe(0)

    const now = nowIso()
    const chronicleId = (await db.chronicles.toArray())[0].id
    const snapshotId = newId()
    await db.characterSnapshots.put({
      id: snapshotId, chronicleId, createdAt: now, updatedAt: now,
      era: 'early 15th century', age: 130, location: 'Sample town: Dunmere',
      skills: [{ name: 'Sample skill: Milling', value: 'Master' }],
      resources: [], conditions: [],
      sourceKind: 'manual',
    })
    expect((await db.characterSnapshots.get(snapshotId))?.era).toBe('early 15th century')

    const attachmentId = newId()
    await db.attachments.put({
      id: attachmentId, chronicleId, createdAt: now, updatedAt: now,
      recordType: 'memory', recordId: (await db.memories.toArray())[0].id,
      fileName: 'sample-note.txt', mimeType: 'text/plain', sizeBytes: 11,
      data: new Blob(['hello world'], { type: 'text/plain' }),
    })
    const attachment = await db.attachments.get(attachmentId)
    expect(attachment?.fileName).toBe('sample-note.txt')
    expect(await attachment?.data.text()).toBe('hello world')
  })
})
