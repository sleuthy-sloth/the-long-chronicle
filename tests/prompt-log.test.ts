// @vitest-environment node
// Feature 1 tests: the used-prompt log is derived from journal entries
// carrying prompt text and from prompt notes explicitly marked used.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '../src/db/database'
import { seedTestChronicle } from './seed-chronicle'
import { newId, nowIso } from '../src/db/types'
import {
  countUsedPrompts,
  isPromptUsed,
  listPromptNotes,
  listUnlinkedPromptNotes,
  listUsedPrompts,
  markPromptNoteUsed,
  searchUsedPrompts,
  unmarkPromptNoteUsed,
} from '../src/lib/promptLog'

beforeEach(async () => {
  await resetDb()
})

async function addNote(
  chronicleId: string,
  input: { text: string; ref?: string; source?: string; era?: string; journalEntryId?: string | null; used?: boolean },
) {
  const now = nowIso()
  const id = newId()
  await db.promptNotes.put({
    id,
    chronicleId,
    createdAt: now,
    updatedAt: now,
    text: input.text,
    ref: input.ref,
    source: input.source,
    era: input.era,
    journalEntryId: input.journalEntryId ?? null,
    used: input.used ?? false,
    usedAt: input.used ? now : null,
  })
  return id
}

describe('listUsedPrompts', () => {
  it('derives used prompts from journal entries carrying prompt text', async () => {
    const seed = await seedTestChronicle()
    const used = await listUsedPrompts(seed.chronicle.id)
    // The seed has one entry with prompt text (entry 1) and one prompt note
    // that is not marked used — only the entry counts.
    expect(used).toHaveLength(1)
    const [item] = used
    expect(item.text).toBe('Sample prompt (invented): what does the rain remind you of?')
    expect(item.journalEntryId).toBe(seed.entryOneId)
    expect(item.era).toBe('late 14th century')
    expect(item.origin).toBe('journalEntry')
    expect(item.promptNoteId).toBeNull()
  })

  it('includes prompt notes explicitly marked used', async () => {
    const seed = await seedTestChronicle()
    await addNote(seed.chronicle.id, {
      text: 'Sample note prompt: what did the miller hide in the loft?',
      ref: 'Note 7',
      source: 'Sample source: a folded scrap',
      era: 'early 15th century',
      used: true,
    })
    const used = await listUsedPrompts(seed.chronicle.id)
    expect(used).toHaveLength(2)
    const noteItem = used.find((p) => p.origin === 'promptNote')!
    expect(noteItem.text).toContain('miller hide in the loft')
    expect(noteItem.ref).toBe('Note 7')
    expect(noteItem.source).toBe('Sample source: a folded scrap')
    expect(noteItem.era).toBe('early 15th century')
    expect(noteItem.journalEntryId).toBeNull()
    expect(noteItem.promptNoteId).not.toBeNull()
  })

  it('lists newest first', async () => {
    const seed = await seedTestChronicle()
    const oldId = await addNote(seed.chronicle.id, { text: 'Sample note prompt: the older one.', used: true })
    // Backdate the older note so ordering is deterministic.
    await db.promptNotes.update(oldId, { usedAt: '1400-01-01T00:00:00.000Z', createdAt: '1400-01-01T00:00:00.000Z' })
    await addNote(seed.chronicle.id, { text: 'Sample note prompt: the newer one.', used: true })
    const used = await listUsedPrompts(seed.chronicle.id)
    expect(used.map((p) => p.text)).toEqual([
      'Sample note prompt: the newer one.',
      'Sample prompt (invented): what does the rain remind you of?',
      'Sample note prompt: the older one.',
    ])
  })

  it('does not double-count a used note that repeats its entry prompt', async () => {
    const seed = await seedTestChronicle()
    await addNote(seed.chronicle.id, {
      text: 'Sample prompt (invented): what does the rain remind you of?',
      journalEntryId: seed.entryOneId,
      used: true,
    })
    const used = await listUsedPrompts(seed.chronicle.id)
    expect(used).toHaveLength(1)
    expect(used[0].origin).toBe('journalEntry')
  })

  it('keeps a used note linked to an entry when its text differs', async () => {
    const seed = await seedTestChronicle()
    await addNote(seed.chronicle.id, {
      text: 'Sample note prompt: a different question about the miller.',
      journalEntryId: seed.entryOneId,
      used: true,
    })
    const used = await listUsedPrompts(seed.chronicle.id)
    expect(used).toHaveLength(2)
    const noteItem = used.find((p) => p.origin === 'promptNote')!
    expect(noteItem.journalEntryId).toBe(seed.entryOneId)
  })
})

describe('searchUsedPrompts', () => {
  it('searches text, ref, and source; filters by era', async () => {
    const seed = await seedTestChronicle()
    await addNote(seed.chronicle.id, {
      text: 'Sample note prompt: what did the miller hide in the loft?',
      ref: 'Note 7',
      source: 'Sample source: a folded scrap',
      era: 'early 15th century',
      used: true,
    })
    expect((await searchUsedPrompts(seed.chronicle.id, { text: 'miller hide' })).map((p) => p.origin)).toEqual([
      'promptNote',
    ])
    expect((await searchUsedPrompts(seed.chronicle.id, { text: 'note 7' }))).toHaveLength(1)
    expect((await searchUsedPrompts(seed.chronicle.id, { text: 'folded scrap' }))).toHaveLength(1)
    expect((await searchUsedPrompts(seed.chronicle.id, { text: 'rain remind' }))).toHaveLength(1)
    expect((await searchUsedPrompts(seed.chronicle.id, { era: 'early 15th' }))).toHaveLength(1)
    expect((await searchUsedPrompts(seed.chronicle.id, { era: 'late 14th' }))).toHaveLength(1)
    expect((await searchUsedPrompts(seed.chronicle.id, { text: 'rain', era: 'early 15th' }))).toHaveLength(0)
    expect((await searchUsedPrompts(seed.chronicle.id, {}))).toHaveLength(2)
  })
})

describe('markPromptNoteUsed / unmark / isPromptUsed', () => {
  it('marks a note used with a timestamp, and it then appears in the log', async () => {
    const seed = await seedTestChronicle()
    const noteId = await addNote(seed.chronicle.id, { text: 'Sample note prompt: the river ledger.' })
    expect(await isPromptUsed(noteId)).toBe(false)
    expect(await countUsedPrompts(seed.chronicle.id)).toBe(1)

    const updated = await markPromptNoteUsed(noteId)
    expect(updated.used).toBe(true)
    expect(updated.usedAt).not.toBeNull()
    expect(await isPromptUsed(noteId)).toBe(true)
    expect(await countUsedPrompts(seed.chronicle.id)).toBe(2)
    expect((await listUsedPrompts(seed.chronicle.id)).some((p) => p.promptNoteId === noteId)).toBe(true)
  })

  it('unmarks a note and clears the timestamp, removing it from the log', async () => {
    const seed = await seedTestChronicle()
    const noteId = await addNote(seed.chronicle.id, { text: 'Sample note prompt: the river ledger.', used: true })
    expect(await countUsedPrompts(seed.chronicle.id)).toBe(2)
    const updated = await unmarkPromptNoteUsed(noteId)
    expect(updated.used).toBe(false)
    expect(updated.usedAt).toBeNull()
    expect(await isPromptUsed(noteId)).toBe(false)
    expect(await countUsedPrompts(seed.chronicle.id)).toBe(1)
  })

  it('throws for an unknown prompt note', async () => {
    await expect(markPromptNoteUsed('no-such-note')).rejects.toThrow(/Prompt note not found/)
    await expect(isPromptUsed('no-such-note')).rejects.toThrow(/Prompt note not found/)
  })
})

describe('listUnlinkedPromptNotes', () => {
  it('surfaces notes neither used nor linked to an entry', async () => {
    const seed = await seedTestChronicle()
    // Seed note: linked to entry 1, unused — not unlinked.
    const freeId = await addNote(seed.chronicle.id, { text: 'Sample note prompt: a loose thread.' })
    await addNote(seed.chronicle.id, { text: 'Sample note prompt: already used.', used: true })
    const unlinked = await listUnlinkedPromptNotes(seed.chronicle.id)
    expect(unlinked.map((n) => n.id)).toEqual([freeId])
    expect((await listPromptNotes(seed.chronicle.id)).length).toBe(3)
  })
})
