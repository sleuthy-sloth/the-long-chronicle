// @vitest-environment node
// Stream D tests: JSON export / import round-trip, validation, overwrite rules.
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../src/db/database'
import { db } from '../src/lib/localDb'
import {
  buildExport,
  collectChronicleData,
  daysSinceLastExport,
  exportCharacterSheet,
  exportJournalEntry,
  exportMemories,
  exportTimeline,
  getDb,
  recordExport,
} from '../src/lib/export'
import {
  ImportError,
  applyImport,
  parseImportFile,
  previewImport,
} from '../src/lib/import'
import { seedTestChronicle } from './seed-chronicle'

beforeEach(async () => {
  await resetDb()
})

describe('JSON export', () => {
  it('collects every record of one chronicle and nothing else', async () => {
    const seed = await seedTestChronicle()
    const other = await seedTestChronicle()
    void other // second chronicle exists to prove isolation
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    expect(data.memories).toHaveLength(3)
    expect(data.memories.filter((m) => m.status === 'Lost')).toHaveLength(1)
    expect(data.memories.filter((m) => m.status === 'Altered')).toHaveLength(1)
    expect(data.memoryVersions).toHaveLength(1)
    expect(data.journal).toHaveLength(2)
    expect(data.journal[0].number).toBe(1)
    expect(data.people).toHaveLength(1)
    expect(data.places).toHaveLength(1)
    expect(data.threads).toHaveLength(1)
    expect(data.timeline).toHaveLength(2)
    expect(data.recaps).toHaveLength(1)
    expect(data.diceRolls).toHaveLength(1)
    expect(data.promptNotes).toHaveLength(1)
    expect(data.quickNotes).toHaveLength(1)
    expect(data.skills).toHaveLength(1)
    expect(data.resources).toHaveLength(1)
    expect(data.stateChanges).toHaveLength(1)
  })

  it('builds a versioned envelope', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    expect(backup.app).toBe('The Long Chronicle')
    expect(backup.schemaVersion).toBe(1)
    expect(backup.exportedAt).toBeTruthy()
    expect(backup.chronicle.title).toBe('The Ashen Archive')
  })

  it('throws for an unknown chronicle', async () => {
    await expect(collectChronicleData(getDb(), 'no-such-id')).rejects.toThrow(/No chronicle found/)
  })

  it('exports a single journal entry with its linked records embedded', async () => {
    const seed = await seedTestChronicle()
    const single = await exportJournalEntry(getDb(), seed.entryOneId)
    expect(single.kind).toBe('journalEntry')
    expect(single.entry.title).toBe('First night in Dunmere')
    expect(single.memories).toHaveLength(1)
    expect(single.memories[0].title).toBe('Rain on stone')
    expect(single.people).toHaveLength(1)
    expect(single.places).toHaveLength(1)
  })

  it('exports memories, character sheet and timeline', async () => {
    const seed = await seedTestChronicle()
    const mems = await exportMemories(getDb(), seed.chronicle.id)
    expect(mems.memories).toHaveLength(3)
    expect(mems.memoryVersions).toHaveLength(1)
    const sheet = await exportCharacterSheet(getDb(), seed.chronicle.id)
    expect(sheet.skills[0].name).toBe('Lockpicking')
    expect(sheet.resources[0].name).toBe('A brass key')
    expect(sheet.stateChanges).toHaveLength(1)
    const timeline = await exportTimeline(getDb(), seed.chronicle.id)
    expect(timeline.timeline).toHaveLength(2)
  })

  it('records the backup time and computes days-since correctly', async () => {
    const seed = await seedTestChronicle()
    expect(daysSinceLastExport(null)).toBeNull()
    expect(daysSinceLastExport(undefined)).toBeNull()
    expect(daysSinceLastExport(new Date().toISOString())).toBe(0)
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000).toISOString()
    expect(daysSinceLastExport(twentyDaysAgo)).toBe(20)
    await recordExport(getDb(), seed.chronicle.id)
    const chronicle = await db.chronicles.get(seed.chronicle.id)
    expect(chronicle?.lastExportAt).toBeTruthy()
    const settings = await db.settings.get('settings')
    expect(settings?.lastExportAt).toBe(chronicle?.lastExportAt)
  })
})

describe('JSON import', () => {
  it('round-trips: export → wipe → import as new, with counts equal', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const json = JSON.stringify(backup)
    await resetDb()
    const parsed = parseImportFile(json)
    const preview = await previewImport(parsed, getDb())
    expect(preview.chronicleTitle).toBe('The Ashen Archive')
    expect(preview.counts['Memories']).toBe(3)
    expect(preview.counts['Journal entries']).toBe(2)
    expect(preview.counts['Memory versions']).toBe(1)
    const result = await applyImport(getDb(), parsed)
    expect(result.mode).toBe('new')
    expect(result.chronicleId).not.toBe(seed.chronicle.id)
    const restored = await collectChronicleData(getDb(), result.chronicleId)
    expect(restored.memories).toHaveLength(3)
    expect(restored.journal).toHaveLength(2)
    expect(restored.memoryVersions).toHaveLength(1)
    expect(restored.people).toHaveLength(1)
    expect(restored.threads).toHaveLength(1)
    expect(restored.timeline).toHaveLength(2)
  })

  it('remaps every id and rewrites cross-links on import-as-new', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const parsed = parseImportFile(JSON.stringify(backup))
    const result = await applyImport(getDb(), parsed)
    const restored = await collectChronicleData(getDb(), result.chronicleId)
    // The imported chronicle keeps its title but gets a "(imported)" suffix
    // because a chronicle with that title already exists.
    expect(restored.chronicle.title).toBe('The Ashen Archive (imported)')
    // No imported id may equal an original id.
    const originalIds = new Set([
      seed.memoryActiveId, seed.memoryLostId, seed.memoryAlteredId,
      seed.entryOneId, seed.entryTwoId, seed.personId, seed.placeId, seed.threadId,
    ])
    for (const m of restored.memories) expect(originalIds.has(m.id)).toBe(false)
    for (const e of restored.journal) expect(originalIds.has(e.id)).toBe(false)
    // Cross-links resolve inside the imported copy: entry 1 links the new
    // memory, person and place — by title, not by stale id.
    const entryOne = restored.journal.find((e) => e.number === 1)!
    const linkedMemory = restored.memories.find((m) => m.id === entryOne.memoryIds[0])
    expect(linkedMemory?.title).toBe('Rain on stone')
    const linkedPerson = restored.people.find((p) => p.id === entryOne.personIds[0])
    expect(linkedPerson?.name).toBe('Anselm the miller')
    const linkedPlace = restored.places.find((p) => p.id === entryOne.placeIds[0])
    expect(linkedPlace?.name).toBe('The mill at the river bend')
    // Memory versions still point at their (new) memory.
    const version = restored.memoryVersions[0]
    const altered = restored.memories.find((m) => m.status === 'Altered')!
    expect(version.memoryId).toBe(altered.id)
    expect(version.text).toContain('forget the debt')
    // The lost memory is still lost, and the original chronicle is untouched.
    expect(restored.memories.find((m) => m.status === 'Lost')?.title).toBe('The lost letter')
    const original = await collectChronicleData(getDb(), seed.chronicle.id)
    expect(original.memories).toHaveLength(3)
    expect(original.journal.find((e) => e.number === 1)?.memoryIds[0]).toBe(seed.memoryActiveId)
  })

  it('preview warns about duplicate ids already in the database', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const preview = await previewImport(parseImportFile(JSON.stringify(backup)), getDb())
    expect(preview.duplicateIds.length).toBeGreaterThan(0)
    expect(preview.warnings.join(' ')).toMatch(/already exist/)
  })

  it('rejects invalid JSON without touching the database', async () => {
    const seed = await seedTestChronicle()
    expect(() => parseImportFile('{not json')).toThrow(ImportError)
    expect(() => parseImportFile('{not json')).toThrow(/not valid JSON/)
    const count = (await db.chronicles.toArray()).length
    expect(count).toBe(1)
    void seed
  })

  it('rejects a missing schemaVersion and a newer schemaVersion', async () => {
    expect(() => parseImportFile(JSON.stringify({ app: 'The Long Chronicle' }))).toThrow(/no schemaVersion/)
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const newer = { ...backup, schemaVersion: 999 }
    expect(() => parseImportFile(JSON.stringify(newer))).toThrow(/newer version/)
    expect(() => parseImportFile(JSON.stringify(newer))).toThrow(/schema v999/)
  })

  it('rejects a structurally invalid backup and names the problem', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const broken = JSON.parse(JSON.stringify(backup)) as Record<string, unknown>
    const memories = broken.memories as Record<string, unknown>[]
    delete memories[0].text
    expect(() => parseImportFile(JSON.stringify(broken))).toThrow(ImportError)
    try {
      parseImportFile(JSON.stringify(broken))
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError)
      expect((err as ImportError).details.join(' ')).toMatch(/memories\.0\.text/)
    }
    // Nothing was written: the original is still the only chronicle.
    expect((await db.chronicles.toArray()).length).toBe(1)
  })

  it('refuses overwrite without explicit confirmation', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const parsed = parseImportFile(JSON.stringify(backup))
    await expect(applyImport(getDb(), parsed, { mode: 'overwrite' })).rejects.toThrow(/explicit confirmation/)
    await expect(applyImport(getDb(), parsed, { mode: 'overwrite', confirmOverwrite: false })).rejects.toThrow(/explicit confirmation/)
  })

  it('overwrite with confirmation replaces the same chronicle id', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const parsed = parseImportFile(JSON.stringify(backup))
    // Change the title in the backup, then replace.
    parsed.chronicle.title = 'The Ashen Archive (restored)'
    const result = await applyImport(getDb(), parsed, { mode: 'overwrite', confirmOverwrite: true })
    expect(result.mode).toBe('overwrite')
    expect(result.chronicleId).toBe(seed.chronicle.id)
    const after = await db.chronicles.get(seed.chronicle.id)
    expect(after?.title).toBe('The Ashen Archive (restored)')
    expect((await collectChronicleData(getDb(), seed.chronicle.id)).memories).toHaveLength(3)
  })

  it('overwrite of a chronicle that does not exist fails cleanly', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    await resetDb()
    const parsed = parseImportFile(JSON.stringify(backup))
    await expect(
      applyImport(getDb(), parsed, { mode: 'overwrite', confirmOverwrite: true }),
    ).rejects.toThrow(/No chronicle with id/)
    expect((await db.chronicles.toArray()).length).toBe(0)
  })
})
