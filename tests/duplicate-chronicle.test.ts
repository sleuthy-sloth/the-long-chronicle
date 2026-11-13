// @vitest-environment node
// GAP A tests: duplicating a chronicle copies EVERYTHING that belongs to it
// — journal entries and drafts, memories + versions, people, relationships,
// places, story threads, recaps, timeline events, dice rolls, prompt notes,
// quick notes, skills, resources, character state changes, and the ending —
// with fresh ids and every cross-link remapped so the copy is fully
// self-contained and independent of the original.
import { beforeEach, describe, expect, it } from 'vitest'
import { archiveChronicle, db, duplicateChronicle, resetDb } from '../src/db/database'
import { collectChronicleData, getDb, type ChronicleData } from '../src/lib/export'
import { seedTestChronicle } from './seed-chronicle'
import { newId, nowIso } from '../src/db/types'

beforeEach(async () => {
  await resetDb()
})

function counts(data: ChronicleData): Record<string, number> {
  return {
    skills: data.skills.length,
    resources: data.resources.length,
    stateChanges: data.stateChanges.length,
    memories: data.memories.length,
    memoryVersions: data.memoryVersions.length,
    journal: data.journal.length,
    drafts: data.drafts.length,
    timeline: data.timeline.length,
    people: data.people.length,
    relationships: data.relationships.length,
    places: data.places.length,
    threads: data.threads.length,
    recaps: data.recaps.length,
    diceRolls: data.diceRolls.length,
    promptNotes: data.promptNotes.length,
    quickNotes: data.quickNotes.length,
    ending: data.ending ? 1 : 0,
  }
}

/**
 * The seed covers most tables; add the ones it does not — a draft linked to
 * entry 1, a relationship for the person, an ending, a memory-derived
 * timeline event, a state change tied to both a skill and a journal entry,
 * and a quick note already converted to a draft ("type:id" link).
 */
async function seedFullChronicle() {
  const seed = await seedTestChronicle()
  const now = nowIso()
  const chronicleId = seed.chronicle.id
  const skill = (await db.skills.where('chronicleId').equals(chronicleId).toArray())[0]

  const draftId = newId()
  await db.journalEntryDrafts.put({
    id: draftId, chronicleId, createdAt: now, updatedAt: now,
    entryId: seed.entryOneId, title: 'Draft: the miller’s door', body: 'Sample draft: what the miller keeps behind his door.', era: 'late 14th century',
  })
  await db.relationships.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    personId: seed.personId, description: 'Sample relationship: the miller owes the vampire a debt.', era: 'late 14th century',
  })
  await db.endings.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    finalEra: 'early 16th century', finalLocation: 'Sample town: Dunmere', endingType: 'Sample ending: the long sleep.',
  })
  await db.timelineEvents.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    title: 'The miller’s promise remembered', era: 'late 14th century',
    type: 'memory', sourceId: seed.memoryActiveId, personIds: [seed.personId], placeIds: [],
  })
  await db.characterStateChanges.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    kind: 'skill', recordId: skill.id, field: 'value', oldValue: 'Novice', newValue: 'Experienced',
    journalEntryId: seed.entryOneId, note: 'Sample change: practiced on the mill door, then wrote it down.',
  })
  await db.quickNotes.put({
    id: newId(), chronicleId, createdAt: now, updatedAt: now,
    text: 'Sample quick note: already turned into a draft.',
    convertedTo: `journal:${draftId}`,
  })
  return { ...seed, skillId: skill.id, draftId }
}

describe('duplicateChronicle (full copy)', () => {
  it('copies every record, with counts matching the original', async () => {
    const seed = await seedFullChronicle()
    const copy = await duplicateChronicle(seed.chronicle.id)
    expect(copy.id).not.toBe(seed.chronicle.id)
    expect(copy.title).toBe('The Ashen Archive (Copy)')
    expect(copy.status).toBe('In Progress')
    expect(copy.vampireName).toBe('Mireille')
    expect(copy.currentAge).toBe(214)
    expect(copy.currentEra).toBe('early 16th century')
    expect(copy.lastExportAt).toBeNull()

    const original = await collectChronicleData(getDb(), seed.chronicle.id)
    const duplicated = await collectChronicleData(getDb(), copy.id)
    expect(counts(duplicated)).toEqual(counts(original))
    expect(counts(duplicated)).toEqual({
      skills: 1,
      resources: 1,
      stateChanges: 2,
      memories: 3,
      memoryVersions: 1,
      journal: 2,
      drafts: 1,
      timeline: 3,
      people: 1,
      relationships: 1,
      places: 1,
      threads: 1,
      recaps: 1,
      diceRolls: 1,
      promptNotes: 1,
      quickNotes: 2,
      ending: 1,
    })
  })

  it('gives the copy fresh ids and remaps every link inside the copy', async () => {
    const seed = await seedFullChronicle()
    const copy = await duplicateChronicle(seed.chronicle.id)
    const original = await collectChronicleData(getDb(), seed.chronicle.id)
    const duplicated = await collectChronicleData(getDb(), copy.id)

    // No id in the copy may equal any id in the original — across all tables.
    const allRows = (data: ChronicleData): { id: string }[] => [
      data.chronicle,
      ...data.skills, ...data.resources, ...data.stateChanges,
      ...data.memories, ...data.memoryVersions, ...data.journal,
      ...data.drafts, ...data.timeline, ...data.people,
      ...data.relationships, ...data.places, ...data.threads,
      ...data.recaps, ...data.diceRolls, ...data.promptNotes,
      ...data.quickNotes,
      ...(data.ending ? [data.ending] : []),
    ]
    const originalIds = new Set(allRows(original).map((r) => r.id))
    const copyIds = allRows(duplicated).map((r) => r.id)
    for (const id of copyIds) expect(originalIds.has(id)).toBe(false)
    // And no link field anywhere in the copy may point at an original id.
    const copyIdSet = new Set(copyIds)
    const linkFields = (row: Record<string, unknown>): string[] => {
      const links: string[] = []
      for (const key of ['personIds', 'placeIds', 'memoryIds', 'journalEntryIds', 'threadIds']) {
        if (Array.isArray(row[key])) links.push(...(row[key] as string[]))
      }
      for (const key of ['memoryId', 'personId', 'entryId', 'journalEntryId', 'sourceId', 'recordId']) {
        if (typeof row[key] === 'string') links.push(row[key] as string)
      }
      if (typeof row.convertedTo === 'string' && row.convertedTo.includes(':')) {
        links.push(row.convertedTo.split(':')[1])
      }
      return links
    }
    const allCopyRows: Record<string, unknown>[] = [
      ...duplicated.skills, ...duplicated.resources, ...duplicated.stateChanges,
      ...duplicated.memories, ...duplicated.memoryVersions, ...duplicated.journal,
      ...duplicated.drafts, ...duplicated.timeline, ...duplicated.people,
      ...duplicated.relationships, ...duplicated.places, ...duplicated.threads,
      ...duplicated.recaps, ...duplicated.diceRolls, ...duplicated.promptNotes,
      ...duplicated.quickNotes,
    ] as unknown as Record<string, unknown>[]
    for (const row of allCopyRows) {
      for (const link of linkFields(row)) {
        expect(originalIds.has(link)).toBe(false)
        expect(copyIdSet.has(link)).toBe(true)
      }
    }

    // Spot-checks: links resolve inside the copy, by content, not by id.
    const entryOne = duplicated.journal.find((e) => e.number === 1)!
    expect(entryOne.era).toBe('late 14th century')
    expect(entryOne.tags).toEqual(['rain'])
    expect(duplicated.memories.find((m) => m.id === entryOne.memoryIds[0])?.title).toBe('Rain on stone')
    expect(duplicated.people.find((p) => p.id === entryOne.personIds[0])?.name).toBe('Anselm the miller')
    expect(duplicated.places.find((p) => p.id === entryOne.placeIds[0])?.name).toBe('The mill at the river bend')
    expect(duplicated.threads.find((t) => t.id === entryOne.threadIds[0])?.title).toBe('The debt owed to the miller')
    expect(duplicated.journal.find((e) => e.number === 2)?.title).toBe('A quiet winter')

    // Memory versions still point at their (new) memory; tags and eras kept.
    const altered = duplicated.memories.find((m) => m.status === 'Altered')!
    expect(altered.tags).toEqual(['miller'])
    const version = duplicated.memoryVersions[0]
    expect(version.memoryId).toBe(altered.id)
    expect(version.text).toContain('forget the debt')
    const rain = duplicated.memories.find((m) => m.title === 'Rain on stone')!
    expect(duplicated.people.find((p) => p.id === rain.personIds[0])?.name).toBe('Anselm the miller')
    expect(duplicated.journal.find((e) => e.id === rain.journalEntryIds[0])?.number).toBe(1)
    expect(duplicated.memories.find((m) => m.status === 'Lost')?.title).toBe('The lost letter')

    // Back-links on person / place / thread resolve inside the copy.
    const person = duplicated.people[0]
    expect(duplicated.memories.find((m) => m.id === person.memoryIds[0])?.title).toBe('Rain on stone')
    expect(duplicated.journal.find((e) => e.id === person.journalEntryIds[0])?.number).toBe(1)
    const place = duplicated.places[0]
    expect(duplicated.people.find((p) => p.id === place.personIds[0])?.name).toBe('Anselm the miller')
    const thread = duplicated.threads[0]
    expect(duplicated.journal.find((e) => e.id === thread.journalEntryIds[0])?.number).toBe(1)

    // Timeline: derived (journal + memory) and manual (historical) events.
    const journalEvent = duplicated.timeline.find((t) => t.type === 'journal')!
    expect(journalEvent.sourceId).toBe(entryOne.id)
    expect(journalEvent.era).toBe('late 14th century')
    const memoryEvent = duplicated.timeline.find((t) => t.type === 'memory')!
    expect(memoryEvent.sourceId).toBe(rain.id)
    const historical = duplicated.timeline.find((t) => t.type === 'historical')!
    expect(historical.era).toBe('around 1410')
    expect(historical.sortYear).toBe(1410)

    // Relationship, draft, prompt note, state changes, quick note, ending.
    expect(duplicated.relationships[0].personId).toBe(person.id)
    expect(duplicated.drafts[0].entryId).toBe(entryOne.id)
    expect(duplicated.promptNotes[0].journalEntryId).toBe(entryOne.id)
    const skillChange = duplicated.stateChanges.find((s) => s.recordId !== undefined)!
    expect(duplicated.skills.find((s) => s.id === skillChange.recordId)?.name).toBe('Lockpicking')
    expect(skillChange.journalEntryId).toBe(entryOne.id)
    expect(duplicated.quickNotes.find((q) => q.convertedTo)?.convertedTo).toBe(
      `journal:${duplicated.drafts[0].id}`,
    )
    expect(duplicated.ending?.finalEra).toBe('early 16th century')
    expect(duplicated.diceRolls[0].dice).toBe('2d6')
    expect(duplicated.recaps[0].title).toBe('Recap: the Dunmere years')
  })

  it('leaves the original untouched, and editing the copy never affects it', async () => {
    const seed = await seedFullChronicle()
    const copy = await duplicateChronicle(seed.chronicle.id)

    // Edit and delete inside the copy only.
    const copyEntryOne = (await collectChronicleData(getDb(), copy.id)).journal.find((e) => e.number === 1)!
    await db.journalEntries.update(copyEntryOne.id, { body: 'Edited only in the copy.' })
    const copyMemory = (await collectChronicleData(getDb(), copy.id)).memories.find((m) => m.title === 'Rain on stone')!
    await db.memories.delete(copyMemory.id)

    const original = await collectChronicleData(getDb(), seed.chronicle.id)
    expect(original.journal.find((e) => e.number === 1)?.body).toContain('I arrived in Dunmere')
    expect(original.memories).toHaveLength(3)
    expect(original.journal.find((e) => e.number === 1)?.memoryIds[0]).toBe(seed.memoryActiveId)
    const duplicated = await collectChronicleData(getDb(), copy.id)
    expect(duplicated.journal.find((e) => e.number === 1)?.body).toBe('Edited only in the copy.')
    expect(duplicated.memories).toHaveLength(2)
  })

  it('duplicates a Completed chronicle as In Progress, without changing the original', async () => {
    const seed = await seedFullChronicle()
    await archiveChronicle(seed.chronicle.id)
    const copy = await duplicateChronicle(seed.chronicle.id)
    expect(copy.status).toBe('In Progress')
    expect(copy.title).toBe('The Ashen Archive (Copy)')
    expect((await db.chronicles.get(seed.chronicle.id))?.status).toBe('Completed')
  })

  it('throws for an unknown chronicle', async () => {
    await expect(duplicateChronicle('no-such-id')).rejects.toThrow(/Chronicle not found/)
  })
})
