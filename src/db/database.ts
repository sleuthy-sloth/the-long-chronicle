// Canonical Dexie database for The Long Chronicle (Stream A).
//
// Database name 'long-chronicle', schema version 2. Table names and indexes
// below are the contract Stream B's shim (src/lib/localDb.ts) was built
// against — do NOT rename a table or drop an index without a version bump,
// or data written by earlier builds becomes unreadable.
//
// ## Migration strategy
// - Every schema change gets a new version: `this.version(3).stores({...})`
//   with the FULL store list (Dexie requires the complete schema per version).
// - Data migrations go in `.upgrade(tx)` on that version, reading the old
//   shape and writing the new one. Never mutate v1's or v2's stores() in place.
// - Zod schemas in src/db/validation.ts are the source of truth for what a
//   valid row looks like; bump the schema version in src/config/app.ts when
//   the shape changes.
// - No seed data is ever written. A fresh install starts empty; the user
//   creates their first chronicle. (Copyright boundary: no rulebook content,
//   prompt tables, or example text is bundled anywhere in this app.)
//
// ## v1 → v2 (seven-features round)
// - New tables: `characterSnapshots`, `attachments`.
// - `memories.lastReviewedAt` (ISO timestamp | null; v1 rows get null) and
//   `promptNotes.used` (boolean; v1 rows get false) / `usedAt` — set by the
//   v2 `.upgrade()` below. Adding a non-indexed field needs no store change,
//   so the upgrade only backfills defaults; all v1 records are preserved.
// - `timelineEvents.type` gains the 'timeJump' value (no store change).
//
// ## Validation
// All write helpers in this file validate through Zod before touching Dexie
// and throw on bad data. Direct `db.<table>.put(...)` calls (used by other
// streams' libs) bypass validation by design — those libs own their own
// shapes — so keep this class free of Dexie `creating`/`updating` hooks.
import Dexie, { type Table } from 'dexie'
import {
  appSettingsSchema,
  characterStateChangeSchema,
  chronicleSchema,
  resourceSchema,
  skillSchema,
} from './validation'
import type { ChronicleData, TableName as ExportTableName } from '../lib/export'
import type { AttachmentExport } from '../lib/export'
import { attachmentFromExport, attachmentToExport } from '../lib/attachments'
import { remapChronicleAsNew } from '../lib/remap'
import type {
  AppSettings,
  Attachment,
  CharacterSnapshot,
  CharacterStateChange,
  Chronicle,
  ChronicleStatus,
  DiceRoll,
  Ending,
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
} from './types'
import { newId, nowIso } from './types'

export const DB_NAME = 'long-chronicle'
export const DB_VERSION = 2
/** The single settings row id. */
export const SETTINGS_ID = 'settings'

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  theme: 'system',
  activeChronicleId: null,
  lastExportAt: null,
  editorFontSize: 16,
}

export class ChronicleDB extends Dexie {
  chronicles!: Table<Chronicle, string>
  skills!: Table<Skill, string>
  resources!: Table<Resource, string>
  characterStateChanges!: Table<CharacterStateChange, string>
  memories!: Table<Memory, string>
  memoryVersions!: Table<MemoryVersion, string>
  journalEntries!: Table<JournalEntry, string>
  journalEntryDrafts!: Table<JournalEntryDraft, string>
  timelineEvents!: Table<TimelineEvent, string>
  people!: Table<Person, string>
  relationships!: Table<Relationship, string>
  places!: Table<Place, string>
  storyThreads!: Table<StoryThread, string>
  recaps!: Table<Recap, string>
  diceRolls!: Table<DiceRoll, string>
  promptNotes!: Table<PromptNote, string>
  quickNotes!: Table<QuickNote, string>
  endings!: Table<Ending, string>
  characterSnapshots!: Table<CharacterSnapshot, string>
  attachments!: Table<Attachment, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
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
    })
    // v2: new tables characterSnapshots + attachments; backfill the new
    // optional fields on v1 rows (lastReviewedAt → null, promptNotes.used →
    // false). The upgrade never deletes or rewrites any other data.
    this.version(2)
      .stores({
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
        characterSnapshots: 'id, chronicleId, createdAt',
        attachments: 'id, chronicleId, recordType, recordId, createdAt',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('memories')
          .toCollection()
          .modify((m: Record<string, unknown>) => {
            if (m.lastReviewedAt === undefined) m.lastReviewedAt = null
          })
        await tx
          .table('promptNotes')
          .toCollection()
          .modify((p: Record<string, unknown>) => {
            if (p.used === undefined) p.used = false
          })
      })
  }
}

/** Backwards-compatible alias: Stream B's shim was named LocalChronicleDb. */
export const LocalChronicleDb = ChronicleDB

/** The single shared instance — every stream talks to this one. */
export const db = new ChronicleDB()

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get(SETTINGS_ID)
  if (!row) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...row }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next = appSettingsSchema.parse({ ...current, ...patch, id: SETTINGS_ID })
  await db.settings.put(next)
  return next
}

export async function setActiveChronicleId(id: string | null): Promise<AppSettings> {
  return saveSettings({ activeChronicleId: id })
}

/** The chronicle the user is currently playing in, or null if none exists yet. */
export async function getActiveChronicle(): Promise<Chronicle | null> {
  const settings = await getSettings()
  if (settings.activeChronicleId) {
    const found = await db.chronicles.get(settings.activeChronicleId)
    if (found) return found
  }
  const all = await db.chronicles.toArray()
  if (all.length === 0) return null
  // Most recently updated chronicle is the working default.
  return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

// ---------------------------------------------------------------------------
// Chronicles
// ---------------------------------------------------------------------------

export interface NewChronicleInput {
  title: string
  vampireName: string
  pronouns?: string
  startingAge: number
  startingEra: string
  startingLocation: string
  concept: string
  tension?: string
}

export async function listChronicles(): Promise<Chronicle[]> {
  const all = await db.chronicles.toArray()
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getChronicle(id: string): Promise<Chronicle | undefined> {
  return db.chronicles.get(id)
}

export async function createChronicle(input: NewChronicleInput): Promise<Chronicle> {
  const now = nowIso()
  const id = newId()
  const chronicle = chronicleSchema.parse({
    id,
    // A chronicle's own chronicleId is its id (Base requires the field).
    chronicleId: id,
    createdAt: now,
    updatedAt: now,
    title: input.title.trim(),
    vampireName: input.vampireName.trim(),
    pronouns: input.pronouns?.trim() || undefined,
    startingAge: input.startingAge,
    currentAge: input.startingAge,
    startingEra: input.startingEra.trim(),
    currentEra: input.startingEra.trim(),
    startingLocation: input.startingLocation.trim(),
    currentLocation: input.startingLocation.trim(),
    concept: input.concept.trim(),
    tension: input.tension?.trim() || undefined,
    status: 'In Progress' as ChronicleStatus,
  })
  await db.chronicles.put(chronicle)
  await setActiveChronicleId(chronicle.id)
  return chronicle
}

export async function updateChronicle(id: string, patch: Partial<Chronicle>): Promise<Chronicle> {
  const existing = await db.chronicles.get(id)
  if (!existing) throw new Error(`Chronicle not found: ${id}`)
  const next = chronicleSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    chronicleId: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  })
  await db.chronicles.put(next)
  return next
}

export async function setChronicleStatus(id: string, status: ChronicleStatus): Promise<Chronicle> {
  return updateChronicle(id, { status })
}

/**
 * Archiving is a status, not a separate store: Completed chronicles are the
 * archive. Restore returns a chronicle to In Progress.
 */
export async function archiveChronicle(id: string): Promise<Chronicle> {
  return setChronicleStatus(id, 'Completed')
}

export async function restoreChronicle(id: string): Promise<Chronicle> {
  return setChronicleStatus(id, 'In Progress')
}

/**
 * Duplicate a chronicle in full: every record that belongs to it — journal
 * entries and drafts, memories and their versions, people, relationships,
 * places, story threads, recaps, timeline events, dice rolls, prompt notes,
 * quick notes, skills, resources, character state changes, and the ending
 * record — is copied with fresh ids and every cross-link remapped to the new
 * ids, so the copy is a self-contained, independent chronicle. The id
 * remapping is the shared implementation in src/lib/remap.ts (also used by
 * import-as-new), so the two paths cannot drift apart.
 *
 * The copy gets a "(Copy)" title suffix and its status resets to In
 * Progress; its backup stamp is cleared (the copy has never been backed up).
 * The whole copy is written in a single Dexie transaction.
 */
export async function duplicateChronicle(id: string): Promise<Chronicle> {
  const original = await db.chronicles.get(id)
  if (!original) throw new Error(`Chronicle not found: ${id}`)
  const byChronicle = async <T extends { chronicleId: string }>(table: Table<T, string>): Promise<T[]> =>
    table.where('chronicleId').equals(id).toArray()
  const data: ChronicleData = {
    chronicle: original,
    skills: await byChronicle(db.skills),
    resources: await byChronicle(db.resources),
    stateChanges: await byChronicle(db.characterStateChanges),
    memories: await byChronicle(db.memories),
    memoryVersions: await byChronicle(db.memoryVersions),
    journal: await byChronicle(db.journalEntries),
    drafts: await byChronicle(db.journalEntryDrafts),
    timeline: await byChronicle(db.timelineEvents),
    people: await byChronicle(db.people),
    relationships: await byChronicle(db.relationships),
    places: await byChronicle(db.places),
    threads: await byChronicle(db.storyThreads),
    recaps: await byChronicle(db.recaps),
    diceRolls: await byChronicle(db.diceRolls),
    promptNotes: await byChronicle(db.promptNotes),
    quickNotes: await byChronicle(db.quickNotes),
    // Backup shape (bytes as base64) — remap works on JSON-safe rows, and the
    // copy is decoded back to Blobs before writing, below.
    attachments: await Promise.all((await byChronicle(db.attachments)).map(attachmentToExport)),
    ending: (await byChronicle(db.endings))[0] ?? null,
  }
  const { chronicle, rows } = remapChronicleAsNew(data)
  if (rows.attachments && rows.attachments.length > 0) {
    rows.attachments = await Promise.all(
      rows.attachments.map((row) => attachmentFromExport(row as AttachmentExport)),
    )
  }
  const now = nowIso()
  const copy = chronicleSchema.parse({
    ...chronicle,
    createdAt: now,
    updatedAt: now,
    title: `${original.title} (Copy)`,
    status: 'In Progress' as ChronicleStatus,
    lastExportAt: null,
  })
  const tables = [db.chronicles, ...CHRONICLE_CHILD_TABLES.map((t) => db.table(t))]
  await db.transaction('rw', tables, async () => {
    await db.chronicles.put(copy)
    for (const [tableName, tableRows] of Object.entries(rows)) {
      const canonical = REMAP_TABLE_TO_DEXIE[tableName as ExportTableName] ?? tableName
      if (tableRows.length > 0) await db.table(canonical).bulkPut(tableRows)
    }
  })
  return copy
}

/**
 * Stream D's table names (used as keys by the shared remap) that differ from
 * the canonical Dexie table names. Every other name is identical.
 */
const REMAP_TABLE_TO_DEXIE: Partial<Record<ExportTableName, string>> = {
  stateChanges: 'characterStateChanges',
  drafts: 'journalEntryDrafts',
  threads: 'storyThreads',
}

const CHRONICLE_CHILD_TABLES = [
  'skills',
  'resources',
  'characterStateChanges',
  'memories',
  'memoryVersions',
  'journalEntries',
  'journalEntryDrafts',
  'timelineEvents',
  'people',
  'relationships',
  'places',
  'storyThreads',
  'recaps',
  'diceRolls',
  'promptNotes',
  'quickNotes',
  'endings',
  'characterSnapshots',
  'attachments',
] as const

/**
 * Delete a chronicle and every record that belongs to it, in one transaction.
 * Callers must offer an export first — deleting is the only destructive
 * action in the app and there is no server copy to recover from.
 */
export async function deleteChronicle(id: string): Promise<void> {
  const tables = [db.chronicles, ...CHRONICLE_CHILD_TABLES.map((t) => db.table(t))]
  await db.transaction('rw', tables, async () => {
    for (const t of CHRONICLE_CHILD_TABLES) {
      await db.table(t).where('chronicleId').equals(id).delete()
    }
    await db.chronicles.delete(id)
  })
  const settings = await getSettings()
  if (settings.activeChronicleId === id) {
    await setActiveChronicleId(null)
  }
}

// ---------------------------------------------------------------------------
// Skills, resources, and character state history
// ---------------------------------------------------------------------------

export async function listSkills(chronicleId: string): Promise<Skill[]> {
  const rows = await db.skills.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listResources(chronicleId: string): Promise<Resource[]> {
  const rows = await db.resources.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listStateChanges(chronicleId: string): Promise<CharacterStateChange[]> {
  const rows = await db.characterStateChanges.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function writeStateChange(
  chronicleId: string,
  change: Omit<CharacterStateChange, 'id' | 'chronicleId' | 'createdAt' | 'updatedAt'>,
): Promise<CharacterStateChange> {
  const now = nowIso()
  const record = characterStateChangeSchema.parse({
    ...change,
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
  })
  await db.characterStateChanges.put(record)
  return record
}

export interface NewSkillInput {
  name: string
  description?: string
  value?: string
  notes?: string
}

export async function addSkill(chronicleId: string, input: NewSkillInput): Promise<Skill> {
  const now = nowIso()
  const skill = skillSchema.parse({
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    value: input.value?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  })
  await db.transaction('rw', [db.skills, db.characterStateChanges], async () => {
    await db.skills.put(skill)
    await writeStateChange(chronicleId, {
      kind: 'skill',
      recordId: skill.id,
      field: 'created',
      newValue: skill.name,
      note: `Skill added: ${skill.name}`,
    })
  })
  return skill
}

const SKILL_FIELDS = ['name', 'description', 'value', 'notes'] as const

export async function updateSkill(id: string, patch: Partial<Skill>): Promise<Skill> {
  const existing = await db.skills.get(id)
  if (!existing) throw new Error(`Skill not found: ${id}`)
  const next = skillSchema.parse({ ...existing, ...patch, id: existing.id, updatedAt: nowIso() })
  const changed = SKILL_FIELDS.filter((f) => (patch[f] ?? existing[f]) !== existing[f] && patch[f] !== undefined)
  await db.transaction('rw', [db.skills, db.characterStateChanges], async () => {
    await db.skills.put(next)
    for (const field of changed) {
      await writeStateChange(next.chronicleId, {
        kind: 'skill',
        recordId: next.id,
        field,
        oldValue: existing[field],
        newValue: next[field],
      })
    }
  })
  return next
}

export async function deleteSkill(id: string): Promise<void> {
  const existing = await db.skills.get(id)
  if (!existing) return
  await db.transaction('rw', [db.skills, db.characterStateChanges], async () => {
    await db.skills.delete(id)
    await writeStateChange(existing.chronicleId, {
      kind: 'skill',
      recordId: id,
      field: 'deleted',
      oldValue: existing.name,
      note: `Skill removed: ${existing.name}`,
    })
  })
}

export interface NewResourceInput {
  name: string
  description?: string
  quantity?: string
  notes?: string
}

export async function addResource(chronicleId: string, input: NewResourceInput): Promise<Resource> {
  const now = nowIso()
  const resource = resourceSchema.parse({
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    quantity: input.quantity?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  })
  await db.transaction('rw', [db.resources, db.characterStateChanges], async () => {
    await db.resources.put(resource)
    await writeStateChange(chronicleId, {
      kind: 'resource',
      recordId: resource.id,
      field: 'created',
      newValue: resource.name,
      note: `Resource added: ${resource.name}`,
    })
  })
  return resource
}

const RESOURCE_FIELDS = ['name', 'description', 'quantity', 'notes'] as const

export async function updateResource(id: string, patch: Partial<Resource>): Promise<Resource> {
  const existing = await db.resources.get(id)
  if (!existing) throw new Error(`Resource not found: ${id}`)
  const next = resourceSchema.parse({ ...existing, ...patch, id: existing.id, updatedAt: nowIso() })
  const changed = RESOURCE_FIELDS.filter((f) => patch[f] !== undefined && patch[f] !== existing[f])
  await db.transaction('rw', [db.resources, db.characterStateChanges], async () => {
    await db.resources.put(next)
    for (const field of changed) {
      await writeStateChange(next.chronicleId, {
        kind: 'resource',
        recordId: next.id,
        field,
        oldValue: existing[field],
        newValue: next[field],
      })
    }
  })
  return next
}

export async function deleteResource(id: string): Promise<void> {
  const existing = await db.resources.get(id)
  if (!existing) return
  await db.transaction('rw', [db.resources, db.characterStateChanges], async () => {
    await db.resources.delete(id)
    await writeStateChange(existing.chronicleId, {
      kind: 'resource',
      recordId: id,
      field: 'deleted',
      oldValue: existing.name,
      note: `Resource removed: ${existing.name}`,
    })
  })
}

/**
 * Free-text character state: conditions, traits, compulsions and anything
 * else the player wants on the record. Each entry is itself a
 * CharacterStateChange, so the history list is the source of truth — there is
 * no separate "current conditions" table to drift out of sync.
 */
export async function addStateEntry(
  chronicleId: string,
  input: {
    kind: 'condition' | 'trait' | 'other'
    field: string
    newValue?: string
    note?: string
    journalEntryId?: string | null
  },
): Promise<CharacterStateChange> {
  return writeStateChange(chronicleId, {
    kind: input.kind,
    field: input.field.trim(),
    newValue: input.newValue?.trim() || undefined,
    note: input.note?.trim() || undefined,
    journalEntryId: input.journalEntryId ?? null,
  })
}

export async function deleteStateChange(id: string): Promise<void> {
  await db.characterStateChanges.delete(id)
}

// ---------------------------------------------------------------------------
// Test / maintenance helpers
// ---------------------------------------------------------------------------

/** Wipe every table — tests only. */
export async function resetDb(): Promise<void> {
  await db.delete()
  await db.open()
}

/** Backwards-compatible alias for Stream B's resetLocalDb. */
export const resetLocalDb = resetDb
