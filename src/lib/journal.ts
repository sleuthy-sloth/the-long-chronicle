// Journal data access + pure logic (Stream B).
// Talks to Dexie through the local shim (src/lib/localDb.ts) until Stream A's
// src/db/database.ts lands; then re-point `db` at the shared instance.
// Drafts persist in Dexie on every autosave so they survive close/reopen.
// Saving an entry and its character state changes happens in ONE Dexie
// transaction, so an entry and its consequences are never half-recorded.
import { db } from './localDb'
import type {
  CharacterStateChange,
  JournalEntry,
  JournalEntryDraft,
  Memory,
  StoryThread,
} from '../db/types'
import { newId, nowIso } from '../db/types'

export function nextEntryNumber(existing: Pick<JournalEntry, 'number'>[]): number {
  return existing.reduce((max, e) => Math.max(max, e.number), 0) + 1
}

export async function listJournalEntries(chronicleId: string): Promise<JournalEntry[]> {
  const entries = await db.journalEntries.where('chronicleId').equals(chronicleId).toArray()
  return entries.sort((a, b) => a.number - b.number)
}

export async function getJournalEntry(id: string): Promise<JournalEntry | undefined> {
  return db.journalEntries.get(id)
}

export async function listDrafts(chronicleId: string): Promise<JournalEntryDraft[]> {
  const drafts = await db.journalEntryDrafts.where('chronicleId').equals(chronicleId).toArray()
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getDraftForEntry(entryId: string): Promise<JournalEntryDraft | undefined> {
  return db.journalEntryDrafts.where('entryId').equals(entryId).first()
}

export async function getDraftById(id: string): Promise<JournalEntryDraft | undefined> {
  return db.journalEntryDrafts.get(id)
}

/** Persist (or update) a draft row — called on every autosave. */
export async function saveDraft(draft: JournalEntryDraft): Promise<JournalEntryDraft> {
  const row: JournalEntryDraft = { ...draft, updatedAt: nowIso() }
  await db.journalEntryDrafts.put(row)
  return row
}

export async function deleteDraft(id: string): Promise<void> {
  await db.journalEntryDrafts.delete(id)
}

export async function togglePinEntry(id: string): Promise<JournalEntry | undefined> {
  const entry = await db.journalEntries.get(id)
  if (!entry) return undefined
  const updated = { ...entry, pinned: !entry.pinned, updatedAt: nowIso() }
  await db.journalEntries.put(updated)
  return updated
}

/** How many character state changes are already linked to this entry. */
export async function linkedStateChangeCount(entryId: string): Promise<number> {
  return db.characterStateChanges.where('journalEntryId').equals(entryId).count()
}

export interface EditGuard {
  needsWarning: boolean
  linkedCount: number
  message: string
}

/**
 * Edit-old-entry guard (pure — testable). Editing an entry that already has
 * linked state changes must warn: saving new text must never silently undo
 * later character changes. The caller asks the player whether the new
 * consequences should also update the related state records.
 */
export function editGuard(linkedCount: number): EditGuard {
  if (linkedCount <= 0) {
    return {
      needsWarning: false,
      linkedCount: 0,
      message: 'This entry has no linked character changes.',
    }
  }
  return {
    needsWarning: true,
    linkedCount,
    message:
      `This entry already has ${linkedCount} linked character change${linkedCount === 1 ? '' : 's'}. ` +
      `Editing it will not undo those changes. Choose whether the consequences you record now should also update the related state records, or save the entry text only and leave the character record as it is.`,
  }
}

export interface NewStateChangeInput {
  kind: CharacterStateChange['kind']
  recordId?: string
  field: string
  oldValue?: string
  newValue?: string
  note?: string
}

export interface SaveEntryInput {
  entry: JournalEntry
  /** New character state changes to record alongside the entry. */
  stateChanges?: NewStateChangeInput[]
  /** New memories created inline from the Consequences step. */
  newMemories?: Memory[]
  /** New unresolved-thread titles to create and link. */
  newThreadTitles?: string[]
}

/**
 * Save an entry and everything it touches in a single Dexie transaction:
 * the entry, its state changes, inline-created memories (with their
 * journalEntryIds back-linked), and new threads. Returns row counts so the
 * caller — and tests — can verify nothing was half-written.
 */
export async function saveEntryWithChanges(input: SaveEntryInput): Promise<{
  entry: JournalEntry
  stateChangeCount: number
  memoryCount: number
  threadCount: number
}> {
  const { entry, stateChanges = [], newMemories = [], newThreadTitles = [] } = input
  const now = nowIso()
  const savedEntry: JournalEntry = { ...entry, updatedAt: now, draft: false }
  return db.transaction(
    'rw',
    db.journalEntries,
    db.characterStateChanges,
    db.memories,
    db.storyThreads,
    db.journalEntryDrafts,
    async () => {
      await db.journalEntries.put(savedEntry)
      let stateChangeCount = 0
      for (const change of stateChanges) {
        const row: CharacterStateChange = {
          id: newId(),
          chronicleId: entry.chronicleId,
          createdAt: now,
          updatedAt: now,
          kind: change.kind,
          recordId: change.recordId,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          journalEntryId: entry.id,
          note: change.note,
        }
        await db.characterStateChanges.add(row)
        stateChangeCount++
      }
      let memoryCount = 0
      for (const memory of newMemories) {
        const linked: Memory = {
          ...memory,
          journalEntryIds: [...new Set([...memory.journalEntryIds, entry.id])],
          updatedAt: now,
        }
        await db.memories.put(linked)
        memoryCount++
      }
      let threadCount = 0
      const threadIds: string[] = [...savedEntry.threadIds]
      for (const title of newThreadTitles) {
        const trimmed = title.trim()
        if (!trimmed) continue
        const thread: StoryThread = {
          id: newId(),
          chronicleId: entry.chronicleId,
          createdAt: now,
          updatedAt: now,
          title: trimmed,
          introducedEra: entry.era,
          status: 'Open',
          personIds: entry.personIds,
          placeIds: entry.placeIds,
          memoryIds: entry.memoryIds,
          journalEntryIds: [entry.id],
        }
        await db.storyThreads.add(thread)
        threadIds.push(thread.id)
        threadCount++
      }
      if (threadCount > 0) {
        await db.journalEntries.update(entry.id, { threadIds, updatedAt: now })
        savedEntry.threadIds = threadIds
      }
      // A saved entry consumes its draft.
      const draft = await db.journalEntryDrafts.where('entryId').equals(entry.id).first()
      if (draft) await db.journalEntryDrafts.delete(draft.id)
      return { entry: savedEntry, stateChangeCount, memoryCount, threadCount }
    },
  )
}

/** Search title + body + prompt text + tags + location (pure — testable). */
export function searchEntries(list: JournalEntry[], query: string): JournalEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((e) =>
    [e.title, e.body, e.promptText ?? '', e.promptRef ?? '', e.location ?? '', e.era, ...e.tags]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
}

export interface EntryFilters {
  era?: string
  location?: string
  tag?: string
  pinnedOnly?: boolean
}

export function filterEntries(list: JournalEntry[], filters: EntryFilters): JournalEntry[] {
  return list.filter((e) => {
    if (filters.era && !e.era.toLowerCase().includes(filters.era.trim().toLowerCase())) return false
    if (filters.location && !(e.location ?? '').toLowerCase().includes(filters.location.trim().toLowerCase())) return false
    if (filters.tag && !e.tags.includes(filters.tag)) return false
    if (filters.pinnedOnly && !e.pinned) return false
    return true
  })
}

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))]
}
