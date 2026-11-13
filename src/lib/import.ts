// Stream D — JSON backup import.
//
// Validation happens BEFORE any write: the file is parsed and Zod-checked
// first, and a failed import leaves the database untouched. Importing
// creates a NEW chronicle by default (every id is regenerated and every
// cross-link remapped). Replacing an existing chronicle is only possible
// with an explicit confirmation flag, and only when that chronicle exists.
import { z } from 'zod'
import { APP } from '../config/app'
import { DEFAULT_SETTINGS } from '../db/database'
import type {
  AppSettings,
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
import {
  SETTINGS_ROW_ID,
  type AttachmentExport,
  type ChronicleData,
  type ChronicleDbLike,
  type ChronicleExport,
  type TableName,
} from './export'
import { attachmentFromExport, isValidBase64 } from './attachments'
import { remapChronicleAsNew } from './remap'

export class ImportError extends Error {
  readonly details: string[]
  constructor(message: string, details: string[] = []) {
    super(message)
    this.name = 'ImportError'
    this.details = details
  }
}

// --- Zod schemas (mirroring src/db/types.ts; unknown future fields kept) ---

const idSchema = z.string().min(1)
const optionalText = z.string().optional()
const nullableText = z.string().nullable().optional()

const baseSchema = z.object({
  id: idSchema,
  chronicleId: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough()

const chronicleSchema = baseSchema.extend({
  title: z.string(),
  vampireName: z.string(),
  pronouns: optionalText,
  startingAge: z.number(),
  currentAge: z.number(),
  startingEra: z.string(),
  currentEra: z.string(),
  startingLocation: z.string(),
  currentLocation: z.string(),
  concept: z.string(),
  tension: optionalText,
  status: z.enum(['In Progress', 'Paused', 'Completed']),
  coverImage: optionalText,
  lastExportAt: nullableText,
}).passthrough()

const skillSchema = baseSchema.extend({
  name: z.string(),
  description: optionalText,
  value: optionalText,
  notes: optionalText,
}).passthrough()

const resourceSchema = baseSchema.extend({
  name: z.string(),
  description: optionalText,
  quantity: optionalText,
  notes: optionalText,
}).passthrough()

const stateChangeSchema = baseSchema.extend({
  kind: z.enum(['skill', 'resource', 'condition', 'trait', 'other']),
  recordId: optionalText,
  field: z.string(),
  oldValue: optionalText,
  newValue: optionalText,
  journalEntryId: z.string().nullable().optional(),
  note: optionalText,
}).passthrough()

const memorySchema = baseSchema.extend({
  code: z.string(),
  title: z.string(),
  text: z.string(),
  status: z.enum(['Active', 'Lost', 'Altered', 'Archived']),
  tags: z.array(z.string()).default([]),
  occurredEra: optionalText,
  recordedEra: optionalText,
  personIds: z.array(z.string()).default([]),
  placeIds: z.array(z.string()).default([]),
  journalEntryIds: z.array(z.string()).default([]),
  notes: optionalText,
}).passthrough()

const memoryVersionSchema = baseSchema.extend({
  memoryId: idSchema,
  version: z.number(),
  text: z.string(),
  status: z.enum(['Active', 'Lost', 'Altered', 'Archived']),
  changedEra: optionalText,
  note: optionalText,
}).passthrough()

const journalEntrySchema = baseSchema.extend({
  number: z.number(),
  title: z.string(),
  era: z.string(),
  age: z.number().optional(),
  location: optionalText,
  promptText: optionalText,
  promptRef: optionalText,
  promptSource: optionalText,
  body: z.string(),
  choices: optionalText,
  consequences: optionalText,
  longTerm: optionalText,
  memoryIds: z.array(z.string()).default([]),
  personIds: z.array(z.string()).default([]),
  placeIds: z.array(z.string()).default([]),
  threadIds: z.array(z.string()).default([]),
  pinned: z.boolean().optional(),
  tags: z.array(z.string()).default([]),
  privateNotes: optionalText,
  draft: z.boolean().optional(),
}).passthrough()

const draftSchema = baseSchema.extend({
  entryId: z.string().nullable().optional(),
  title: z.string(),
  body: z.string(),
  era: z.string(),
  promptText: optionalText,
  promptRef: optionalText,
}).passthrough()

const timelineEventSchema = baseSchema.extend({
  title: z.string(),
  description: optionalText,
  era: z.string(),
  sortYear: z.number().nullable().optional(),
  type: z.enum(['journal', 'memory', 'historical', 'relationship', 'location', 'skill', 'resource', 'custom']),
  sourceId: z.string().nullable().optional(),
  personIds: z.array(z.string()).default([]),
  placeIds: z.array(z.string()).default([]),
}).passthrough()

const personSchema = baseSchema.extend({
  name: z.string(),
  description: optionalText,
  firstAppearance: optionalText,
  lastKnownEra: optionalText,
  relationship: optionalText,
  wants: optionalText,
  status: z.string(),
  notes: optionalText,
  memoryIds: z.array(z.string()).default([]),
  journalEntryIds: z.array(z.string()).default([]),
}).passthrough()

const relationshipSchema = baseSchema.extend({
  personId: idSchema,
  description: z.string(),
  era: z.string(),
}).passthrough()

const placeSchema = baseSchema.extend({
  name: z.string(),
  description: optionalText,
  region: optionalText,
  firstVisit: optionalText,
  lastVisit: optionalText,
  significance: optionalText,
  personIds: z.array(z.string()).default([]),
  memoryIds: z.array(z.string()).default([]),
  journalEntryIds: z.array(z.string()).default([]),
}).passthrough()

const threadSchema = baseSchema.extend({
  title: z.string(),
  description: optionalText,
  introducedEra: optionalText,
  status: z.enum(['Open', 'Dormant', 'Resolved', 'Abandoned']),
  personIds: z.array(z.string()).default([]),
  placeIds: z.array(z.string()).default([]),
  memoryIds: z.array(z.string()).default([]),
  journalEntryIds: z.array(z.string()).default([]),
  resolutionNotes: optionalText,
}).passthrough()

const recapSchema = baseSchema.extend({
  title: z.string(),
  era: z.string(),
  body: z.string(),
}).passthrough()

const diceRollSchema = baseSchema.extend({
  dice: z.string(),
  results: z.array(z.number()),
  total: z.number(),
  note: optionalText,
}).passthrough()

const promptNoteSchema = baseSchema.extend({
  text: z.string(),
  ref: optionalText,
  source: optionalText,
  era: optionalText,
  journalEntryId: z.string().nullable().optional(),
}).passthrough()

const quickNoteSchema = baseSchema.extend({
  text: z.string(),
  convertedTo: z.string().nullable().optional(),
}).passthrough()

/**
 * One attachment as it appears in a backup. Validated per-row in
 * parseImportFile (see below) — a single corrupt file must not kill the
 * whole import — so this schema is NOT part of chronicleExportSchema.
 */
const attachmentExportSchema = z.object({
  id: idSchema,
  chronicleId: idSchema,
  recordType: z.enum(['memory', 'journalEntry', 'person', 'place']),
  recordId: idSchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(0),
  dataBase64: z.string().refine((v) => isValidBase64(v), 'file data is not valid base64'),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough()

const endingSchema = baseSchema.extend({
  finalEra: z.string(),
  finalAge: z.number().optional(),
  finalLocation: optionalText,
  endingType: optionalText,
  whatLost: optionalText,
  whatEndured: optionalText,
  finalScene: optionalText,
  epilogue: optionalText,
}).passthrough()

export const chronicleExportSchema = z.object({
  app: z.string(),
  schemaVersion: z.number(),
  exportedAt: z.string(),
  chronicle: chronicleSchema,
  skills: z.array(skillSchema).default([]),
  resources: z.array(resourceSchema).default([]),
  stateChanges: z.array(stateChangeSchema).default([]),
  memories: z.array(memorySchema).default([]),
  memoryVersions: z.array(memoryVersionSchema).default([]),
  journal: z.array(journalEntrySchema).default([]),
  drafts: z.array(draftSchema).default([]),
  timeline: z.array(timelineEventSchema).default([]),
  people: z.array(personSchema).default([]),
  relationships: z.array(relationshipSchema).default([]),
  places: z.array(placeSchema).default([]),
  threads: z.array(threadSchema).default([]),
  recaps: z.array(recapSchema).default([]),
  diceRolls: z.array(diceRollSchema).default([]),
  promptNotes: z.array(promptNoteSchema).default([]),
  quickNotes: z.array(quickNoteSchema).default([]),
  // Accepted as-is here and validated per-row in parseImportFile: one corrupt
  // attachment must not fail the whole backup (see attachmentExportSchema).
  attachments: z.array(z.unknown()).default([]),
  ending: endingSchema.nullable().default(null),
  settings: z
    .object({
      activeChronicleId: z.string().nullable().optional(),
      lastExportAt: z.string().nullable().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough()

// --- Parsing / validation --------------------------------------------------

/** Parse and validate backup text. Throws ImportError; writes nothing. */
export function parseImportFile(text: string): ChronicleExport {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('That file is not valid JSON, so nothing was imported.')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ImportError('That file is not a Long Chronicle backup (expected a JSON object).')
  }
  const obj = raw as Record<string, unknown>
  if (obj.schemaVersion === undefined) {
    throw new ImportError('That file has no schemaVersion, so it cannot be recognised as a Long Chronicle backup.')
  }
  if (typeof obj.schemaVersion !== 'number' || !Number.isInteger(obj.schemaVersion)) {
    throw new ImportError(`Unsupported backup version "${String(obj.schemaVersion)}" — expected a whole number.`)
  }
  if (obj.schemaVersion > APP.schemaVersion) {
    throw new ImportError(
      `This backup was created by a newer version of ${APP.name} (schema v${obj.schemaVersion}; this app understands up to v${APP.schemaVersion}). Update the app, then import again. Nothing was imported.`,
    )
  }
  if (obj.schemaVersion < 1) {
    throw new ImportError(`Unsupported backup version v${obj.schemaVersion}. Nothing was imported.`)
  }
  const result = chronicleExportSchema.safeParse(raw)
  if (!result.success) {
    const details = result.error.issues.slice(0, 8).map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(backup)'
      return `${path}: ${issue.message}`
    })
    throw new ImportError(
      'That backup failed validation, so nothing was imported. Fix the file or export a fresh backup.',
      details,
    )
  }
  const data = result.data as ChronicleExport
  // Attachments are validated one row at a time: a corrupt file (bad base64,
  // missing name, wrong shape) is dropped and reported, and the rest of the
  // chronicle still imports. The dropped rows are listed on the parsed data
  // so previewImport can warn about them.
  const rawAttachments = Array.isArray(obj.attachments) ? obj.attachments : []
  const validAttachments: AttachmentExport[] = []
  const skippedAttachments: { fileName: string; reason: string }[] = []
  for (const row of rawAttachments) {
    const parsed = attachmentExportSchema.safeParse(row)
    if (parsed.success) {
      validAttachments.push(parsed.data)
    } else {
      const fileName =
        row !== null &&
        typeof row === 'object' &&
        typeof (row as Record<string, unknown>).fileName === 'string'
          ? ((row as Record<string, unknown>).fileName as string)
          : '(unnamed file)'
      skippedAttachments.push({
        fileName,
        reason: parsed.error.issues
          .slice(0, 2)
          .map((issue) => {
            const path = issue.path.length ? issue.path.join('.') : '(attachment)'
            return `${path}: ${issue.message}`
          })
          .join('; '),
      })
    }
  }
  data.attachments = validAttachments
  if (skippedAttachments.length > 0) data.skippedAttachments = skippedAttachments
  return data
}

// --- Preview ----------------------------------------------------------------

export interface ImportPreview {
  chronicleTitle: string
  vampireName: string
  exportedAt: string
  schemaVersion: number
  counts: Record<string, number>
  totalRecords: number
  /** Ids already present in this database (matters for replace mode). */
  duplicateIds: { table: TableName; id: ID }[]
  warnings: string[]
}

const COUNT_TABLES: { key: keyof ChronicleData; table: TableName; label: string }[] = [
  { key: 'skills', table: 'skills', label: 'Skills' },
  { key: 'resources', table: 'resources', label: 'Resources' },
  { key: 'stateChanges', table: 'stateChanges', label: 'Character changes' },
  { key: 'memories', table: 'memories', label: 'Memories' },
  { key: 'memoryVersions', table: 'memoryVersions', label: 'Memory versions' },
  { key: 'journal', table: 'journalEntries', label: 'Journal entries' },
  { key: 'drafts', table: 'drafts', label: 'Drafts' },
  { key: 'timeline', table: 'timelineEvents', label: 'Timeline events' },
  { key: 'people', table: 'people', label: 'People' },
  { key: 'relationships', table: 'relationships', label: 'Relationships' },
  { key: 'places', table: 'places', label: 'Places' },
  { key: 'threads', table: 'threads', label: 'Story threads' },
  { key: 'recaps', table: 'recaps', label: 'Recaps' },
  { key: 'diceRolls', table: 'diceRolls', label: 'Dice rolls' },
  { key: 'promptNotes', table: 'promptNotes', label: 'Prompt notes' },
  { key: 'quickNotes', table: 'quickNotes', label: 'Quick notes' },
  { key: 'attachments', table: 'attachments', label: 'Attachments' },
]

function countRecords(data: ChronicleExport): Record<string, number> {
  const counts: Record<string, number> = { Chronicle: 1 }
  for (const { key, label } of COUNT_TABLES) {
    const rows = (data[key] as unknown[]) ?? []
    counts[label] = rows.length
  }
  counts['Ending'] = data.ending ? 1 : 0
  return counts
}

/** Summarise a validated backup before anything is written. */
export async function previewImport(
  data: ChronicleExport,
  db?: ChronicleDbLike,
): Promise<ImportPreview> {
  const counts = countRecords(data)
  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0)
  const duplicateIds: { table: TableName; id: ID }[] = []
  const warnings: string[] = []
  if (data.skippedAttachments?.length) {
    warnings.push(
      `${data.skippedAttachments.length} attachment(s) in this backup had corrupt file data and will be skipped (${data.skippedAttachments.map((s) => s.fileName).join(', ')}). The rest of the chronicle still imports.`,
    )
  }
  if (db) {
    for (const { key, table } of COUNT_TABLES) {
      const rows = (data[key] as { id: ID }[]) ?? []
      if (rows.length === 0) continue
      const existing = new Set((await db.table<{ id: ID }>(table).toArray()).map((r) => r.id))
      for (const row of rows) if (existing.has(row.id)) duplicateIds.push({ table, id: row.id })
    }
    const existingChronicle = await db.table<Chronicle>('chronicles').get(data.chronicle.id)
    if (existingChronicle) duplicateIds.unshift({ table: 'chronicles', id: data.chronicle.id })
    const sameTitle = (await db.table<Chronicle>('chronicles').toArray()).some(
      (c) => c.id !== data.chronicle.id && c.title === data.chronicle.title,
    )
    if (sameTitle) warnings.push(`A chronicle titled "${data.chronicle.title}" already exists; the import will be named "${data.chronicle.title} (imported)".`)
  }
  if (duplicateIds.length > 0) {
    warnings.push(
      `${duplicateIds.length} record id(s) in this backup already exist in this database. Importing as a new chronicle is safe (fresh ids are generated); replacing would overwrite them.`,
    )
  }
  return {
    chronicleTitle: data.chronicle.title,
    vampireName: data.chronicle.vampireName,
    exportedAt: data.exportedAt,
    schemaVersion: data.schemaVersion,
    counts,
    totalRecords,
    duplicateIds,
    warnings,
  }
}

// --- Applying an import ------------------------------------------------------

export interface ApplyImportOptions {
  /** 'new' (default): fresh ids, remapped links. 'overwrite': replace the matching chronicle. */
  mode?: 'new' | 'overwrite'
  /** Required for mode 'overwrite' — the UI must collect an explicit confirmation. */
  confirmOverwrite?: boolean
}

export interface ApplyImportResult {
  chronicleId: ID
  chronicleTitle: string
  mode: 'new' | 'overwrite'
  counts: Record<string, number>
}

async function deleteChronicleRecords(db: ChronicleDbLike, chronicleId: ID): Promise<void> {
  for (const table of [
    'skills', 'resources', 'stateChanges', 'memories', 'memoryVersions',
    'journalEntries', 'drafts', 'timelineEvents', 'people', 'relationships',
    'places', 'threads', 'recaps', 'diceRolls', 'promptNotes', 'quickNotes', 'attachments', 'endings',
  ] as TableName[]) {
    const rows = await db.table<{ id: ID; chronicleId: ID }>(table).toArray()
    const doomed = rows.filter((r) => r.chronicleId === chronicleId).map((r) => r.id)
    if (doomed.length > 0) await db.table(table).bulkDelete(doomed)
  }
  await db.table('chronicles').delete(chronicleId)
}

async function putAll(db: ChronicleDbLike, table: TableName, rows: readonly any[]): Promise<void> {
  if (rows.length > 0) await db.table(table).bulkPut(rows)
}

/**
 * Write a validated backup into the database. Only call after parseImportFile
 * and (for the UI) previewImport. Validation already passed by construction —
 * this function never partially applies: overwrite mode deletes the old
 * chronicle only after the incoming data is fully in hand.
 */
export async function applyImport(
  db: ChronicleDbLike,
  data: ChronicleExport,
  options: ApplyImportOptions = {},
): Promise<ApplyImportResult> {
  const mode = options.mode ?? 'new'
  const counts = countRecords(data)

  if (mode === 'overwrite') {
    if (!options.confirmOverwrite) {
      throw new ImportError(
        'Replacing a chronicle needs explicit confirmation. Import as a new chronicle instead, or confirm the replacement.',
      )
    }
    const existing = await db.table<Chronicle>('chronicles').get(data.chronicle.id)
    if (!existing) {
      throw new ImportError(
        `No chronicle with id "${data.chronicle.id}" exists to replace. Import as a new chronicle instead.`,
      )
    }
    await deleteChronicleRecords(db, data.chronicle.id)
    const clone: ChronicleExport = JSON.parse(JSON.stringify(data))
    await db.table<Chronicle>('chronicles').put(clone.chronicle)
    await putAll(db, 'skills', clone.skills)
    await putAll(db, 'resources', clone.resources)
    await putAll(db, 'stateChanges', clone.stateChanges)
    await putAll(db, 'memories', clone.memories)
    await putAll(db, 'memoryVersions', clone.memoryVersions)
    await putAll(db, 'journalEntries', clone.journal)
    await putAll(db, 'drafts', clone.drafts)
    await putAll(db, 'timelineEvents', clone.timeline)
    await putAll(db, 'people', clone.people)
    await putAll(db, 'relationships', clone.relationships)
    await putAll(db, 'places', clone.places)
    await putAll(db, 'threads', clone.threads)
    await putAll(db, 'recaps', clone.recaps)
    await putAll(db, 'diceRolls', clone.diceRolls)
    await putAll(db, 'promptNotes', clone.promptNotes)
    await putAll(db, 'quickNotes', clone.quickNotes)
    // Backup rows carry bytes as base64; decode them back to Blobs.
    if (clone.attachments.length > 0) {
      await putAll(db, 'attachments', await Promise.all(clone.attachments.map(attachmentFromExport)))
    }
    if (clone.ending) await putAll(db, 'endings', [clone.ending])
    return { chronicleId: clone.chronicle.id, chronicleTitle: clone.chronicle.title, mode, counts }
  }

  const { chronicle, rows } = remapChronicleAsNew(data)
  // Backup rows carry bytes as base64; decode them back to Blobs before writing.
  if (rows.attachments && rows.attachments.length > 0) {
    rows.attachments = await Promise.all(
      rows.attachments.map((row) => attachmentFromExport(row as AttachmentExport)),
    )
  }
  // Same-title collision: keep both chronicles distinguishable.
  const sameTitle = (await db.table<Chronicle>('chronicles').toArray()).some((c) => c.title === chronicle.title)
  if (sameTitle) chronicle.title = `${chronicle.title} (imported)`
  await db.table<Chronicle>('chronicles').put(chronicle)
  for (const table of Object.keys(rows) as TableName[]) {
    await putAll(db, table, rows[table] ?? [])
  }
  const settings = await db.table<AppSettings>('settings').get(SETTINGS_ROW_ID)
  await db.table<AppSettings>('settings').put({
    ...(settings ?? DEFAULT_SETTINGS),
    id: SETTINGS_ROW_ID,
    activeChronicleId: chronicle.id,
  })
  return { chronicleId: chronicle.id, chronicleTitle: chronicle.title, mode, counts }
}
