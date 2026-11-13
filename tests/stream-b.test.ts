// @vitest-environment node
// Stream B tests: Memories + Journal + safe Markdown.
// Dexie runs against fake-indexeddb via tests/setup.ts.
// NOTE: node environment is declared here because jsdom is not installed
// (vitest.config.ts declares jsdom, but package.json has no jsdom dep and
// npm install fails with EPERM in this sandbox). These tests need no DOM.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetLocalDb } from '../src/lib/localDb'
import type { Chronicle, JournalEntry, Memory } from '../src/db/types'
import { newId, nowIso } from '../src/db/types'
import {
  alterMemory,
  archiveMemory,
  createMemory,
  filterMemories,
  loseMemory,
  nextMemoryCode,
  restoreMemory,
  searchMemories,
} from '../src/lib/memories'
import {
  editGuard,
  getDraftForEntry,
  linkedStateChangeCount,
  listJournalEntries,
  nextEntryNumber,
  saveDraft,
  saveEntryWithChanges,
} from '../src/lib/journal'
import { renderMarkdown } from '../src/lib/markdown'

const CHRONICLE_ID = 'chronicle-test-1'

async function seedChronicle(): Promise<Chronicle> {
  const now = nowIso()
  const c: Chronicle = {
    id: CHRONICLE_ID,
    chronicleId: CHRONICLE_ID,
    createdAt: now,
    updatedAt: now,
    title: 'Test Chronicle',
    vampireName: 'Test Vampire',
    startingAge: 20,
    currentAge: 120,
    startingEra: 'early 14th century',
    currentEra: 'late 14th century',
    startingLocation: 'Venice',
    currentLocation: 'Venice',
    concept: 'test',
    status: 'In Progress',
  }
  await db.chronicles.put(c)
  return c
}

function memoryRow(overrides: Partial<Memory> = {}): Memory {
  const now = nowIso()
  return {
    id: newId(),
    chronicleId: CHRONICLE_ID,
    createdAt: now,
    updatedAt: now,
    code: 'M001',
    title: 'Test memory',
    text: 'Original text.',
    status: 'Active',
    tags: [],
    personIds: [],
    placeIds: [],
    journalEntryIds: [],
    ...overrides,
  }
}

beforeEach(async () => {
  await resetLocalDb()
  await seedChronicle()
})

describe('M001 code assignment', () => {
  it('starts at M001 for an empty chronicle', () => {
    expect(nextMemoryCode([])).toBe('M001')
  })
  it('increments past the highest existing code', () => {
    expect(nextMemoryCode([{ code: 'M001' }, { code: 'M002' }, { code: 'M010' }])).toBe('M011')
  })
  it('ignores non-M codes and gaps', () => {
    expect(nextMemoryCode([{ code: 'X9' }, { code: 'M004' }])).toBe('M005')
  })
  it('createMemory assigns sequential codes per chronicle', async () => {
    const a = await createMemory(CHRONICLE_ID, { title: 'One', text: 'First.' })
    const b = await createMemory(CHRONICLE_ID, { title: 'Two', text: 'Second.' })
    expect(a.code).toBe('M001')
    expect(b.code).toBe('M002')
  })
})

describe('lose / alter / restore / archive', () => {
  it('losing preserves the original text, writes a version, and never deletes', async () => {
    const m = await createMemory(CHRONICLE_ID, { title: 'The mill', text: 'I remember the miller’s laugh.' })
    const lost = await loseMemory(m.id, { note: 'Taken in the fire.', changedEra: 'late 14th century' })
    expect(lost.status).toBe('Lost')
    expect(lost.text).toBe('I remember the miller’s laugh.')
    const stillThere = await db.memories.get(m.id)
    expect(stillThere).toBeDefined()
    expect(stillThere?.text).toBe('I remember the miller’s laugh.')
    const versions = await db.memoryVersions.where('memoryId').equals(m.id).toArray()
    expect(versions).toHaveLength(1)
    expect(versions[0].status).toBe('Lost')
    expect(versions[0].text).toBe('I remember the miller’s laugh.')
    expect(versions[0].note).toBe('Taken in the fire.')
    const activity = await db.timelineEvents.where('sourceId').equals(m.id).toArray()
    expect(activity.length).toBeGreaterThanOrEqual(1)
  })

  it('altering preserves the prior version and records the new text', async () => {
    const m = await createMemory(CHRONICLE_ID, { title: 'The mill', text: 'The miller laughed.' })
    const altered = await alterMemory(m.id, {
      newText: 'The miller wept.',
      note: 'The memory shifted.',
      changedEra: 'late 14th century',
    })
    expect(altered.status).toBe('Altered')
    expect(altered.text).toBe('The miller wept.')
    const versions = await db.memoryVersions.where('memoryId').equals(m.id).toArray()
    expect(versions).toHaveLength(1)
    expect(versions[0].text).toBe('The miller laughed.')
    expect(versions[0].status).toBe('Altered')
  })

  it('restore reactivates a lost memory without rewriting its text', async () => {
    const m = await createMemory(CHRONICLE_ID, { title: 'The mill', text: 'The miller laughed.' })
    await loseMemory(m.id, { note: 'Gone.' })
    const restored = await restoreMemory(m.id)
    expect(restored.status).toBe('Active')
    expect(restored.text).toBe('The miller laughed.')
    const versions = await db.memoryVersions.where('memoryId').equals(m.id).toArray()
    expect(versions).toHaveLength(2)
  })

  it('archive keeps the memory on record with Archived status', async () => {
    const m = await createMemory(CHRONICLE_ID, { title: 'The mill', text: 'The miller laughed.' })
    const archived = await archiveMemory(m.id)
    expect(archived.status).toBe('Archived')
    expect(await db.memories.get(m.id)).toBeDefined()
  })
})

describe('search and filter', () => {
  it('search finds a memory by a phrase in its text', async () => {
    await createMemory(CHRONICLE_ID, { title: 'The mill', text: 'The miller laughed at the river.' })
    await createMemory(CHRONICLE_ID, { title: 'The sea', text: 'Salt wind, nothing else.', tags: ['coast'] })
    const all = await db.memories.where('chronicleId').equals(CHRONICLE_ID).toArray()
    expect(searchMemories(all, 'miller laughed')).toHaveLength(1)
    expect(searchMemories(all, 'coast')).toHaveLength(1)
    expect(searchMemories(all, 'MILLER')).toHaveLength(1)
    expect(searchMemories(all, '')).toHaveLength(2)
  })

  it('filter narrows by status, tag and person', () => {
    const list = [
      memoryRow({ code: 'M001', status: 'Active', tags: ['venice'], personIds: ['p1'] }),
      memoryRow({ code: 'M002', status: 'Lost', tags: ['venice'], personIds: [] }),
      memoryRow({ code: 'M003', status: 'Active', tags: ['sea'], personIds: ['p1'] }),
    ]
    expect(filterMemories(list, { status: 'Lost' })).toHaveLength(1)
    expect(filterMemories(list, { tag: 'venice' })).toHaveLength(2)
    expect(filterMemories(list, { personId: 'p1' })).toHaveLength(2)
    expect(filterMemories(list, { status: 'Active', tag: 'sea' })).toHaveLength(1)
  })
})

describe('journal drafts', () => {
  it('a draft persists and restores after close/reopen', async () => {
    const now = nowIso()
    await saveDraft({
      id: 'draft-1',
      chronicleId: CHRONICLE_ID,
      createdAt: now,
      updatedAt: now,
      entryId: null,
      title: 'Unfinished entry',
      body: 'Half-written thoughts…',
      era: 'late 14th century',
      promptText: 'A door you cannot open.',
      promptRef: 'Prompt 12',
    })
    const restored = await getDraftForEntry('missing-entry')
    expect(restored).toBeUndefined()
    const drafts = await db.journalEntryDrafts.where('chronicleId').equals(CHRONICLE_ID).toArray()
    expect(drafts).toHaveLength(1)
    expect(drafts[0].body).toBe('Half-written thoughts…')
    expect(drafts[0].promptText).toBe('A door you cannot open.')
  })

  it('nextEntryNumber follows the highest existing number', () => {
    expect(nextEntryNumber([])).toBe(1)
    expect(nextEntryNumber([{ number: 1 }, { number: 3 }])).toBe(4)
  })
})

describe('saveEntryWithChanges — one transaction', () => {
  it('saves entry + state changes + inline memory + thread with matching counts', async () => {
    const now = nowIso()
    const entry: JournalEntry = {
      id: newId(),
      chronicleId: CHRONICLE_ID,
      createdAt: now,
      updatedAt: now,
      number: 1,
      title: 'The fire',
      era: 'late 14th century',
      location: 'Venice',
      body: 'The abbey burned.',
      memoryIds: [],
      personIds: [],
      placeIds: [],
      threadIds: [],
      tags: ['fire'],
    }
    const inlineMemory = memoryRow({ code: 'M001', title: 'The abbey', text: 'Stone and smoke.' })
    const result = await saveEntryWithChanges({
      entry,
      stateChanges: [
        { kind: 'skill', field: 'value', oldValue: 'Novice', newValue: 'Adept', note: 'Learned the hard way.' },
        { kind: 'resource', field: 'quantity', oldValue: '3', newValue: '1', note: 'Spent.' },
      ],
      newMemories: [inlineMemory],
      newThreadTitles: ['Who set the fire?'],
    })
    expect(result.stateChangeCount).toBe(2)
    expect(result.memoryCount).toBe(1)
    expect(result.threadCount).toBe(1)

    const savedEntries = await listJournalEntries(CHRONICLE_ID)
    expect(savedEntries).toHaveLength(1)
    expect(savedEntries[0].title).toBe('The fire')
    const changes = await db.characterStateChanges.where('journalEntryId').equals(entry.id).toArray()
    expect(changes).toHaveLength(2)
    const savedMemory = await db.memories.get(inlineMemory.id)
    expect(savedMemory?.journalEntryIds).toContain(entry.id)
    const threads = await db.storyThreads.where('chronicleId').equals(CHRONICLE_ID).toArray()
    expect(threads).toHaveLength(1)
    expect(threads[0].title).toBe('Who set the fire?')
    expect(savedEntries[0].threadIds).toContain(threads[0].id)
  })
})

describe('edit guard', () => {
  it('no warning when an entry has no linked state changes', () => {
    const guard = editGuard(0)
    expect(guard.needsWarning).toBe(false)
    expect(guard.linkedCount).toBe(0)
  })

  it('warns and names the count when linked changes exist', () => {
    const guard = editGuard(3)
    expect(guard.needsWarning).toBe(true)
    expect(guard.linkedCount).toBe(3)
    expect(guard.message).toContain('3')
  })

  it('linkedStateChangeCount reflects rows saved with the entry', async () => {
    const now = nowIso()
    const entry: JournalEntry = {
      id: newId(),
      chronicleId: CHRONICLE_ID,
      createdAt: now,
      updatedAt: now,
      number: 1,
      title: 'Entry',
      era: 'late 14th century',
      body: 'Body.',
      memoryIds: [],
      personIds: [],
      placeIds: [],
      threadIds: [],
      tags: [],
    }
    expect(await linkedStateChangeCount(entry.id)).toBe(0)
    await saveEntryWithChanges({
      entry,
      stateChanges: [{ kind: 'trait', field: 'notes', newValue: 'Wary now.' }],
    })
    expect(await linkedStateChangeCount(entry.id)).toBe(1)
  })
})

describe('safe Markdown', () => {
  it('renders headings, bold, italic, lists, quotes and links', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n> a quote\n\n[Venice](https://example.com)')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<blockquote>a quote</blockquote>')
    expect(html).toContain('<a href="https://example.com"')
  })

  it('escapes HTML and refuses javascript: links', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[click](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('javascript:')
  })
})
