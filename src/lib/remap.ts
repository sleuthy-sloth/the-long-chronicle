// Shared chronicle remap: give a whole chronicle's data fresh ids and rewrite
// every cross-link to the new ids, so the result is a self-contained,
// independent copy of the chronicle.
//
// Single implementation for both callers — duplicate (src/db/database.ts)
// and import-as-new (src/lib/import.ts) — so the two paths can never drift
// apart on which links get remapped.
//
// Link fields remapped (see src/db/types.ts):
// - id arrays: personIds, placeIds, memoryIds, journalEntryIds, threadIds
// - single ids: memoryId, personId, entryId, journalEntryId, sourceId, recordId
// - QuickNote.convertedTo, which is "type:id" — only the id part after the
//   colon is remapped; the "type:" prefix is preserved.
//
// Every record id is pre-registered before any link is rewritten, so links
// resolve regardless of table order. A link to an id that is not part of the
// chronicle (a dangling link) gets a fresh id too, so the copy never points
// back at the original chronicle's records.
import { newId, nowIso } from '../db/types'
import type { Chronicle, ID } from '../db/types'
import type { ChronicleData, TableName } from './export'

export interface RemappedChronicle {
  chronicle: Chronicle
  rows: Partial<Record<TableName, any[]>>
}

/** Remap every id in a chronicle's data to fresh ids, rewriting all cross-links. */
export function remapChronicleAsNew(data: ChronicleData): RemappedChronicle {
  // Deep-clone so the caller's data is never mutated.
  const clone: ChronicleData = JSON.parse(JSON.stringify(data))
  const idMap = new Map<ID, ID>()
  const fresh = (oldId: ID): ID => {
    const existing = idMap.get(oldId)
    if (existing) return existing
    const next = newId()
    idMap.set(oldId, next)
    return next
  }

  const newChronicleId = fresh(clone.chronicle.id)
  const remapList = (ids: ID[] | undefined): ID[] => (ids ?? []).map((id) => idMap.get(id) ?? fresh(id))
  const remapOne = (id: ID | null | undefined): ID | null | undefined =>
    id == null ? id : (idMap.get(id) ?? fresh(id))

  // Pre-register fresh ids for every record so links can resolve in any order.
  const allRows: { table: TableName; rows: any[] }[] = [
    { table: 'skills', rows: clone.skills },
    { table: 'resources', rows: clone.resources },
    { table: 'stateChanges', rows: clone.stateChanges },
    { table: 'memories', rows: clone.memories },
    { table: 'memoryVersions', rows: clone.memoryVersions },
    { table: 'journalEntries', rows: clone.journal },
    { table: 'drafts', rows: clone.drafts },
    { table: 'timelineEvents', rows: clone.timeline },
    { table: 'people', rows: clone.people },
    { table: 'relationships', rows: clone.relationships },
    { table: 'places', rows: clone.places },
    { table: 'threads', rows: clone.threads },
    { table: 'recaps', rows: clone.recaps },
    { table: 'diceRolls', rows: clone.diceRolls },
    { table: 'promptNotes', rows: clone.promptNotes },
    { table: 'quickNotes', rows: clone.quickNotes },
    // Attachments ride along as backup-shaped rows (bytes as base64); their
    // recordId is remapped by the shared rewrite below, so the copy's files
    // point at the copy's records, never the originals.
    { table: 'attachments', rows: clone.attachments },
  ]
  if (clone.ending) allRows.push({ table: 'endings', rows: [clone.ending] })
  for (const { rows } of allRows) for (const row of rows) fresh(row.id)

  const rewrite = (row: any): any => {
    row.id = idMap.get(row.id) ?? row.id
    row.chronicleId = newChronicleId
    if (Array.isArray(row.personIds)) row.personIds = remapList(row.personIds)
    if (Array.isArray(row.placeIds)) row.placeIds = remapList(row.placeIds)
    if (Array.isArray(row.memoryIds)) row.memoryIds = remapList(row.memoryIds)
    if (Array.isArray(row.journalEntryIds)) row.journalEntryIds = remapList(row.journalEntryIds)
    if (Array.isArray(row.threadIds)) row.threadIds = remapList(row.threadIds)
    if (row.memoryId !== undefined) row.memoryId = remapOne(row.memoryId)
    if (row.personId !== undefined) row.personId = remapOne(row.personId)
    if (row.entryId !== undefined) row.entryId = remapOne(row.entryId)
    if (row.journalEntryId !== undefined) row.journalEntryId = remapOne(row.journalEntryId)
    if (row.sourceId !== undefined) row.sourceId = remapOne(row.sourceId)
    if (row.recordId !== undefined) row.recordId = remapOne(row.recordId)
    if (row.convertedTo !== undefined && row.convertedTo != null) {
      // "type:id" — remap only the id part, keep the "type:" prefix.
      const value: string = row.convertedTo
      const colon = value.indexOf(':')
      if (colon >= 0) {
        const targetId = value.slice(colon + 1)
        row.convertedTo = targetId
          ? `${value.slice(0, colon + 1)}${remapOne(targetId)}`
          : value
      } else {
        row.convertedTo = remapOne(value)
      }
    }
    return row
  }

  const rows: Partial<Record<TableName, any[]>> = {}
  for (const { table, rows: tableRows } of allRows) {
    rows[table] = tableRows.map((row) => rewrite({ ...row }))
  }
  const chronicle: Chronicle = {
    ...clone.chronicle,
    id: newChronicleId,
    chronicleId: newChronicleId,
    updatedAt: nowIso(),
  }
  return { chronicle, rows }
}
