// Stream D — JSON backup / export.
//
// SEAM NOTE: Stream A's database (src/db/database.ts) has landed, so `getDb()`
// now returns an adapter over the canonical Dexie instance instead of the
// old seam db. Stream D's table names differ from the canonical ones in three
// places — 'stateChanges' vs 'characterStateChanges', 'drafts' vs
// 'journalEntryDrafts', 'threads' vs 'storyThreads' — and the adapter maps
// them, so no function below changes. The seam db class is deleted; the
// canonical settings row id is 'settings' (see src/db/database.ts).
import { APP } from '../config/app'
import { newId, nowIso } from '../db/types'
import { db as canonicalDb, DEFAULT_SETTINGS } from '../db/database'
import { attachmentToExport } from './attachments'
import type {
  AppSettings,
  Attachment,
  CharacterStateChange,
  Chronicle,
  DiceRoll,
  Ending,
  ID,
  JournalEntry,
  JournalEntryDraft,
  Memory,
  MemoryVersion,
  Person,
  Place,
  PromptNote,
  QuickNote,
  Recap,
  Relationship,
  Resource,
  Skill,
  StoryThread,
  TimelineEvent,
} from '../db/types'

/** Minimal structural view of a Dexie table — everything export/import needs. */
export interface TableLike<T> {
  toArray(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  put(value: T): Promise<unknown>
  bulkPut(values: readonly T[]): Promise<unknown>
  add(value: T): Promise<unknown>
  delete(id: string): Promise<void>
  bulkDelete(ids: readonly string[]): Promise<void>
  update(id: string, changes: Partial<T>): Promise<number>
  clear(): Promise<void>
}

/** Minimal structural view of a Dexie database — everything export/import needs. */
export interface ChronicleDbLike {
  table<T = any>(name: string): TableLike<T>
}

export const TABLE_NAMES = [
  'chronicles',
  'skills',
  'resources',
  'stateChanges',
  'memories',
  'memoryVersions',
  'journalEntries',
  'drafts',
  'timelineEvents',
  'people',
  'relationships',
  'places',
  'threads',
  'recaps',
  'diceRolls',
  'promptNotes',
  'quickNotes',
  'attachments',
  'endings',
  'settings',
] as const

export type TableName = (typeof TABLE_NAMES)[number]

/** One attachment as it appears in a JSON backup: file bytes as base64. */
export interface AttachmentExport {
  id: ID
  chronicleId: ID
  recordType: Attachment['recordType']
  recordId: ID
  fileName: string
  mimeType: string
  sizeBytes: number
  dataBase64: string
  createdAt: string
  updatedAt: string
}

/** The full, chronicle-scoped data set. Also the body of a JSON backup. */
export interface ChronicleData {
  chronicle: Chronicle
  skills: Skill[]
  resources: Resource[]
  stateChanges: CharacterStateChange[]
  memories: Memory[]
  memoryVersions: MemoryVersion[]
  journal: JournalEntry[]
  drafts: JournalEntryDraft[]
  timeline: TimelineEvent[]
  people: Person[]
  relationships: Relationship[]
  places: Place[]
  threads: StoryThread[]
  recaps: Recap[]
  diceRolls: DiceRoll[]
  promptNotes: PromptNote[]
  quickNotes: QuickNote[]
  attachments: AttachmentExport[]
  ending: Ending | null
}

export interface ChronicleExport extends ChronicleData {
  app: string
  schemaVersion: number
  exportedAt: string
  /** Settings that belong to the chronicle, not the device (theme stays local). */
  settings: { activeChronicleId?: string | null; lastExportAt?: string | null }
  /** Import-side only: attachments dropped while parsing because their file
   *  data was corrupt. Never written by buildExport. */
  skippedAttachments?: { fileName: string; reason: string }[]
}

export const SETTINGS_ROW_ID = 'settings'

/**
 * Table-name map: Stream D's ChronicleDbLike names → canonical Dexie tables.
 * Three names differ (see the seam note at the top of this file).
 */
const TABLE_NAME_MAP: Partial<Record<TableName, string>> = {
  stateChanges: 'characterStateChanges',
  drafts: 'journalEntryDrafts',
  threads: 'storyThreads',
}

/**
 * The shared database, behind the ChronicleDbLike surface every export /
 * import function takes. A Dexie Table satisfies TableLike structurally.
 */
export function getDb(): ChronicleDbLike {
  return {
    table<T = unknown>(name: string): TableLike<T> {
      return canonicalDb.table<T>(TABLE_NAME_MAP[name as TableName] ?? name) as unknown as TableLike<T>
    },
  }
}

async function table<T>(db: ChronicleDbLike, name: TableName): Promise<T[]> {
  return db.table<T>(name).toArray()
}

function forChronicle<T extends { chronicleId: ID }>(rows: T[], chronicleId: ID): T[] {
  return rows.filter((r) => r.chronicleId === chronicleId)
}

/** Load every record belonging to one chronicle. Throws if it does not exist. */
export async function collectChronicleData(
  db: ChronicleDbLike,
  chronicleId: ID,
): Promise<ChronicleData> {
  const chronicle = await db.table<Chronicle>('chronicles').get(chronicleId)
  if (!chronicle) throw new Error(`No chronicle found with id "${chronicleId}".`)
  const [
    skills,
    resources,
    stateChanges,
    memories,
    memoryVersions,
    journal,
    drafts,
    timeline,
    people,
    relationships,
    places,
    threads,
    recaps,
    diceRolls,
    promptNotes,
    quickNotes,
    endings,
    rawAttachments,
  ] = await Promise.all([
    table<Skill>(db, 'skills'),
    table<Resource>(db, 'resources'),
    table<CharacterStateChange>(db, 'stateChanges'),
    table<Memory>(db, 'memories'),
    table<MemoryVersion>(db, 'memoryVersions'),
    table<JournalEntry>(db, 'journalEntries'),
    table<JournalEntryDraft>(db, 'drafts'),
    table<TimelineEvent>(db, 'timelineEvents'),
    table<Person>(db, 'people'),
    table<Relationship>(db, 'relationships'),
    table<Place>(db, 'places'),
    table<StoryThread>(db, 'threads'),
    table<Recap>(db, 'recaps'),
    table<DiceRoll>(db, 'diceRolls'),
    table<PromptNote>(db, 'promptNotes'),
    table<QuickNote>(db, 'quickNotes'),
    table<Ending>(db, 'endings'),
    table<Attachment>(db, 'attachments'),
  ])
  return {
    chronicle,
    skills: forChronicle(skills, chronicleId),
    resources: forChronicle(resources, chronicleId),
    stateChanges: forChronicle(stateChanges, chronicleId),
    memories: forChronicle(memories, chronicleId),
    memoryVersions: forChronicle(memoryVersions, chronicleId),
    journal: forChronicle(journal, chronicleId).sort((a, b) => a.number - b.number),
    drafts: forChronicle(drafts, chronicleId),
    timeline: forChronicle(timeline, chronicleId),
    people: forChronicle(people, chronicleId),
    relationships: forChronicle(relationships, chronicleId),
    places: forChronicle(places, chronicleId),
    threads: forChronicle(threads, chronicleId),
    recaps: forChronicle(recaps, chronicleId),
    diceRolls: forChronicle(diceRolls, chronicleId),
    promptNotes: forChronicle(promptNotes, chronicleId),
    quickNotes: forChronicle(quickNotes, chronicleId),
    // Backup shape: file bytes as base64, so the JSON stays self-contained.
    attachments: await Promise.all(
      forChronicle(rawAttachments, chronicleId).map(attachmentToExport),
    ),
    ending: forChronicle(endings, chronicleId)[0] ?? null,
  }
}

/** Build the versioned JSON backup envelope for one chronicle. */
export async function buildExport(
  db: ChronicleDbLike,
  chronicleId: ID,
): Promise<ChronicleExport> {
  const data = await collectChronicleData(db, chronicleId)
  const settings = await db.table<AppSettings>('settings').get(SETTINGS_ROW_ID)
  return {
    app: APP.name,
    schemaVersion: APP.schemaVersion,
    exportedAt: nowIso(),
    ...data,
    settings: {
      activeChronicleId: settings?.activeChronicleId ?? chronicleId,
      lastExportAt: settings?.lastExportAt ?? data.chronicle.lastExportAt ?? null,
    },
  }
}

/** Record that a backup just happened, on the chronicle and in settings. */
export async function recordExport(
  db: ChronicleDbLike,
  chronicleId: ID,
  at = nowIso(),
): Promise<void> {
  await db.table<Chronicle>('chronicles').update(chronicleId, { lastExportAt: at })
  const settings = await db.table<AppSettings>('settings').get(SETTINGS_ROW_ID)
  await db.table<AppSettings>('settings').put({
    ...(settings ?? DEFAULT_SETTINGS),
    id: SETTINGS_ROW_ID,
    activeChronicleId: settings?.activeChronicleId ?? chronicleId,
    lastExportAt: at,
  })
}

/** Whole days since an ISO timestamp, or null when there is no timestamp. */
export function daysSinceLastExport(lastExportAt: string | null | undefined, now = Date.now()): number | null {
  if (!lastExportAt) return null
  const then = Date.parse(lastExportAt)
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((now - then) / 86_400_000))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

export function exportFileName(chronicle: Chronicle, kind: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${slugify(chronicle.title || APP.shortName)}-${kind}-${date}.${ext}`
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/**
 * Trigger a browser download of a file. Works fully offline (Blob + anchor).
 * Throws a plain Error when downloads are unavailable (e.g. unit tests).
 */
export function downloadFile(filename: string, content: string | Blob, mime = 'application/json'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Downloads are not available in this environment.')
  }
  const blob = typeof content === 'string' ? new Blob([content], { type: `${mime};charset=utf-8` }) : content
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Full JSON backup: download it and record the backup time. */
export async function downloadJsonBackup(db: ChronicleDbLike, chronicleId: ID): Promise<ChronicleExport> {
  const backup = await buildExport(db, chronicleId)
  downloadFile(exportFileName(backup.chronicle, 'backup', 'json'), toJson(backup))
  await recordExport(db, chronicleId, backup.exportedAt)
  return backup
}

// --- Single-record exports -------------------------------------------------

export interface SingleRecordExport {
  app: string
  schemaVersion: number
  exportedAt: string
  kind: 'journalEntry' | 'memories' | 'characterSheet' | 'timeline'
  chronicleId: ID
  chronicleTitle: string
}

function singleEnvelope(kind: SingleRecordExport['kind'], chronicle: Chronicle) {
  return {
    app: APP.name,
    schemaVersion: APP.schemaVersion,
    exportedAt: nowIso(),
    kind,
    chronicleId: chronicle.id,
    chronicleTitle: chronicle.title,
  }
}

/** One journal entry, with the memories / people / places it links to embedded. */
export async function exportJournalEntry(db: ChronicleDbLike, entryId: ID) {
  const entry = await db.table<JournalEntry>('journalEntries').get(entryId)
  if (!entry) throw new Error(`No journal entry found with id "${entryId}".`)
  const data = await collectChronicleData(db, entry.chronicleId)
  const byId = <T extends { id: ID }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
  const memories = byId(data.memories)
  const people = byId(data.people)
  const places = byId(data.places)
  return {
    ...singleEnvelope('journalEntry', data.chronicle),
    entry,
    memories: entry.memoryIds.map((id) => memories.get(id)).filter((m): m is Memory => Boolean(m)),
    people: entry.personIds.map((id) => people.get(id)).filter((p): p is Person => Boolean(p)),
    places: entry.placeIds.map((id) => places.get(id)).filter((p): p is Place => Boolean(p)),
  }
}

/** All memories of a chronicle (current text plus every stored version). */
export async function exportMemories(db: ChronicleDbLike, chronicleId: ID) {
  const data = await collectChronicleData(db, chronicleId)
  return {
    ...singleEnvelope('memories', data.chronicle),
    memories: data.memories,
    memoryVersions: data.memoryVersions,
  }
}

/** The character sheet: chronicle header, skills, resources, change history. */
export async function exportCharacterSheet(db: ChronicleDbLike, chronicleId: ID) {
  const data = await collectChronicleData(db, chronicleId)
  return {
    ...singleEnvelope('characterSheet', data.chronicle),
    chronicle: data.chronicle,
    skills: data.skills,
    resources: data.resources,
    stateChanges: data.stateChanges,
  }
}

/** The timeline of a chronicle, in stored order. */
export async function exportTimeline(db: ChronicleDbLike, chronicleId: ID) {
  const data = await collectChronicleData(db, chronicleId)
  return {
    ...singleEnvelope('timeline', data.chronicle),
    timeline: data.timeline,
  }
}

/** Download a single-record export as JSON. `kind` selects the builder. */
export async function downloadSingleExport(
  db: ChronicleDbLike,
  kind: SingleRecordExport['kind'],
  id: ID,
): Promise<void> {
  let payload: unknown
  let filename: string
  if (kind === 'journalEntry') {
    payload = await exportJournalEntry(db, id)
    filename = `journal-entry-${(payload as { entry: JournalEntry }).entry.number}.json`
  } else if (kind === 'memories') {
    payload = await exportMemories(db, id)
    filename = `${slugify((payload as { chronicleTitle: string }).chronicleTitle)}-memories-${new Date().toISOString().slice(0, 10)}.json`
  } else if (kind === 'characterSheet') {
    payload = await exportCharacterSheet(db, id)
    filename = exportFileName((payload as { chronicle: Chronicle }).chronicle, 'character-sheet', 'json')
  } else {
    payload = await exportTimeline(db, id)
    filename = exportFileName({ title: (payload as { chronicleTitle: string }).chronicleTitle } as Chronicle, 'timeline', 'json')
  }
  downloadFile(filename, toJson(payload))
}

/** Create a throwaway chronicle id for tests / callers that need one. */
export function freshId(): ID {
  return newId()
}
