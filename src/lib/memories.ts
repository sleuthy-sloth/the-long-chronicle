// Memories data access + pure logic (Stream B).
// Talks to Dexie through the local shim (src/lib/localDb.ts) until Stream A's
// src/db/database.ts lands; then re-point `db` at the shared instance.
// A memory is NEVER deleted for being marked lost — losing only changes its
// status, preserves the original text, and writes a MemoryVersion (plus a
// TimelineEvent activity record) in the same transaction.
import { db } from './localDb'
import type { Memory, MemoryStatus, MemoryVersion, TimelineEvent } from '../db/types'
import { newId, nowIso } from '../db/types'

export const MEMORY_STATUSES: MemoryStatus[] = ['Active', 'Lost', 'Altered', 'Archived']

export const MEMORY_STATUS_META: Record<MemoryStatus, { label: string; icon: string; hint: string }> = {
  Active: { label: 'Active', icon: '✦', hint: 'Remembered clearly' },
  Lost: { label: 'Lost', icon: '✕', hint: 'Lost — the memory is gone, the record remains' },
  Altered: { label: 'Altered', icon: '↻', hint: 'Changed from how it was first recorded' },
  Archived: { label: 'Archived', icon: '▣', hint: 'Set aside, kept on record' },
}

/** Next free code for a chronicle: M001, M002, … (pure — testable). */
export function nextMemoryCode(existing: Pick<Memory, 'code'>[]): string {
  let max = 0
  for (const m of existing) {
    const match = /^M(\d+)$/.exec(m.code ?? '')
    if (match) max = Math.max(max, parseInt(match[1], 10))
  }
  return `M${String(max + 1).padStart(3, '0')}`
}

export async function listMemories(chronicleId: string): Promise<Memory[]> {
  return db.memories.where('chronicleId').equals(chronicleId).sortBy('code')
}

export async function getMemory(id: string): Promise<Memory | undefined> {
  return db.memories.get(id)
}

export async function listMemoryVersions(memoryId: string): Promise<MemoryVersion[]> {
  const versions = await db.memoryVersions.where('memoryId').equals(memoryId).toArray()
  return versions.sort((a, b) => b.version - a.version)
}

export interface NewMemoryInput {
  title: string
  text: string
  status?: MemoryStatus
  tags?: string[]
  occurredEra?: string
  recordedEra?: string
  personIds?: string[]
  placeIds?: string[]
  journalEntryIds?: string[]
  notes?: string
}

export async function createMemory(chronicleId: string, input: NewMemoryInput): Promise<Memory> {
  const existing = await db.memories.where('chronicleId').equals(chronicleId).toArray()
  const now = nowIso()
  const memory: Memory = {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    code: nextMemoryCode(existing),
    title: input.title.trim(),
    text: input.text,
    status: input.status ?? 'Active',
    tags: input.tags ?? [],
    occurredEra: input.occurredEra?.trim() || undefined,
    recordedEra: input.recordedEra?.trim() || undefined,
    personIds: input.personIds ?? [],
    placeIds: input.placeIds ?? [],
    journalEntryIds: input.journalEntryIds ?? [],
    notes: input.notes?.trim() || undefined,
  }
  await db.memories.add(memory)
  return memory
}

export async function updateMemory(id: string, patch: Partial<Memory>): Promise<void> {
  await db.memories.update(id, { ...patch, updatedAt: nowIso() })
}

async function nextVersionNumber(memoryId: string): Promise<number> {
  const versions = await db.memoryVersions.where('memoryId').equals(memoryId).toArray()
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1
}

function lossActivity(memory: Memory, note?: string): TimelineEvent {
  const now = nowIso()
  return {
    id: newId(),
    chronicleId: memory.chronicleId,
    createdAt: now,
    updatedAt: now,
    title: `Memory ${memory.code} lost: ${memory.title}`,
    description: note ? `Marked lost. ${note}` : 'Marked lost. The original text is preserved on the record.',
    era: memory.recordedEra ?? memory.occurredEra ?? '',
    type: 'memory',
    sourceId: memory.id,
    personIds: memory.personIds,
    placeIds: memory.placeIds,
  }
}

/** Mark a memory lost. Original text is preserved; a version + activity record are written. */
export async function loseMemory(
  id: string,
  opts: { note?: string; changedEra?: string } = {},
): Promise<Memory> {
  return db.transaction('rw', db.memories, db.memoryVersions, db.timelineEvents, async () => {
    const memory = await db.memories.get(id)
    if (!memory) throw new Error(`Memory not found: ${id}`)
    const now = nowIso()
    const version: MemoryVersion = {
      id: newId(),
      chronicleId: memory.chronicleId,
      createdAt: now,
      updatedAt: now,
      memoryId: memory.id,
      version: await nextVersionNumber(memory.id),
      text: memory.text,
      status: 'Lost',
      changedEra: opts.changedEra?.trim() || memory.recordedEra,
      note: opts.note?.trim() || 'Marked lost.',
    }
    await db.memoryVersions.add(version)
    await db.timelineEvents.add(lossActivity(memory, opts.note))
    const updated: Memory = { ...memory, status: 'Lost', updatedAt: now }
    await db.memories.put(updated)
    return updated
  })
}

/** Alter a memory: prior version preserved, new text recorded, version written. */
export async function alterMemory(
  id: string,
  opts: { newText: string; note?: string; changedEra?: string },
): Promise<Memory> {
  if (!opts.newText.trim()) throw new Error('Altered text must not be empty.')
  return db.transaction('rw', db.memories, db.memoryVersions, db.timelineEvents, async () => {
    const memory = await db.memories.get(id)
    if (!memory) throw new Error(`Memory not found: ${id}`)
    const now = nowIso()
    const version: MemoryVersion = {
      id: newId(),
      chronicleId: memory.chronicleId,
      createdAt: now,
      updatedAt: now,
      memoryId: memory.id,
      version: await nextVersionNumber(memory.id),
      text: memory.text,
      status: 'Altered',
      changedEra: opts.changedEra?.trim() || memory.recordedEra,
      note: opts.note?.trim() || 'Altered.',
    }
    await db.memoryVersions.add(version)
    await db.timelineEvents.add({
      id: newId(),
      chronicleId: memory.chronicleId,
      createdAt: now,
      updatedAt: now,
      title: `Memory ${memory.code} altered: ${memory.title}`,
      description: opts.note ? `Altered. ${opts.note}` : 'Altered. The previous wording is preserved in version history.',
      era: opts.changedEra?.trim() || memory.recordedEra || memory.occurredEra || '',
      type: 'memory',
      sourceId: memory.id,
      personIds: memory.personIds,
      placeIds: memory.placeIds,
    })
    const updated: Memory = { ...memory, text: opts.newText, status: 'Altered', updatedAt: now }
    await db.memories.put(updated)
    return updated
  })
}

/** Restore a Lost/Altered memory to Active. Text is never rewritten by a restore. */
export async function restoreMemory(id: string, note = 'Restored to active.'): Promise<Memory> {
  return db.transaction('rw', db.memories, db.memoryVersions, async () => {
    const memory = await db.memories.get(id)
    if (!memory) throw new Error(`Memory not found: ${id}`)
    const now = nowIso()
    await db.memoryVersions.add({
      id: newId(),
      chronicleId: memory.chronicleId,
      createdAt: now,
      updatedAt: now,
      memoryId: memory.id,
      version: await nextVersionNumber(memory.id),
      text: memory.text,
      status: 'Active',
      note,
    })
    const updated: Memory = { ...memory, status: 'Active', updatedAt: now }
    await db.memories.put(updated)
    return updated
  })
}

export async function archiveMemory(id: string): Promise<Memory> {
  return db.transaction('rw', db.memories, db.memoryVersions, async () => {
    const memory = await db.memories.get(id)
    if (!memory) throw new Error(`Memory not found: ${id}`)
    const now = nowIso()
    await db.memoryVersions.add({
      id: newId(),
      chronicleId: memory.chronicleId,
      createdAt: now,
      updatedAt: now,
      memoryId: memory.id,
      version: await nextVersionNumber(memory.id),
      text: memory.text,
      status: 'Archived',
      note: 'Archived.',
    })
    const updated: Memory = { ...memory, status: 'Archived', updatedAt: now }
    await db.memories.put(updated)
    return updated
  })
}

/** Search title + text + tags (pure — testable). */
export function searchMemories(list: Memory[], query: string): Memory[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((m) =>
    [m.title, m.text, m.notes ?? '', ...m.tags].join(' ').toLowerCase().includes(q),
  )
}

export interface MemoryFilters {
  status?: MemoryStatus | 'All'
  tag?: string
  personId?: string
  placeId?: string
  era?: string
}

/** Filter by status / tag / person / place / era substring (pure — testable). */
export function filterMemories(list: Memory[], filters: MemoryFilters): Memory[] {
  return list.filter((m) => {
    if (filters.status && filters.status !== 'All' && m.status !== filters.status) return false
    if (filters.tag && !m.tags.includes(filters.tag)) return false
    if (filters.personId && !m.personIds.includes(filters.personId)) return false
    if (filters.placeId && !m.placeIds.includes(filters.placeId)) return false
    if (filters.era) {
      const era = filters.era.trim().toLowerCase()
      if (![m.occurredEra ?? '', m.recordedEra ?? ''].join(' ').toLowerCase().includes(era)) return false
    }
    return true
  })
}

/** All tags in use across a memory list, with counts (pure). */
export function tagCounts(list: Memory[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const m of list) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))]
}
