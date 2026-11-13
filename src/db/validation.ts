// Zod schemas for every entity in src/db/types.ts (Stream A).
//
// Write paths in src/db/database.ts (and the import path in src/lib/export.ts)
// parse through these before touching Dexie. Reads do NOT validate — data
// written by older app versions must stay readable; validation failures on
// read are a migration concern, not a crash.
//
// Rules are deliberately about shape, not about the game: nothing here encodes
// Thousand Year Old Vampire rules, prompt tables or example text. Era and
// location are free-text strings, ages are plain integers.
import { z } from 'zod'
import type {
  AppSettings,
  CharacterStateChange,
  Chronicle,
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

const isoDateTime = z.string().datetime({ offset: true })
const id = z.string().min(1, 'id is required')
const optText = z.string().optional()
const optTextNull = z.string().nullable().optional()

const baseSchema = z.object({
  id,
  chronicleId: z.string().min(1, 'chronicleId is required'),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export const chronicleStatusSchema = z.enum(['In Progress', 'Paused', 'Completed'])
export const memoryStatusSchema = z.enum(['Active', 'Lost', 'Altered', 'Archived'])
export const threadStatusSchema = z.enum(['Open', 'Dormant', 'Resolved', 'Abandoned'])
export const stateChangeKindSchema = z.enum(['skill', 'resource', 'condition', 'trait', 'other'])
export const timelineEventTypeSchema = z.enum([
  'journal',
  'memory',
  'historical',
  'relationship',
  'location',
  'skill',
  'resource',
  'custom',
])
export const themeSchema = z.enum(['light', 'dark', 'system'])

const ageSchema = z.number().int('age must be a whole number').min(0, 'age cannot be negative').max(100000)

export const chronicleSchema = baseSchema.extend({
  title: z.string().min(1, 'title is required').max(200),
  vampireName: z.string().min(1, 'vampire name is required').max(200),
  pronouns: optText,
  startingAge: ageSchema,
  currentAge: ageSchema,
  startingEra: z.string().min(1, 'starting era is required').max(200),
  currentEra: z.string().min(1, 'current era is required').max(200),
  startingLocation: z.string().min(1, 'starting location is required').max(200),
  currentLocation: z.string().min(1, 'current location is required').max(200),
  concept: z.string().max(2000),
  tension: optText,
  status: chronicleStatusSchema,
  coverImage: optText,
  lastExportAt: z.string().datetime({ offset: true }).nullable().optional(),
}) satisfies z.ZodType<Chronicle>

export const skillSchema = baseSchema.extend({
  name: z.string().min(1, 'skill name is required').max(200),
  description: optText,
  value: optText,
  notes: optText,
}) satisfies z.ZodType<Skill>

export const resourceSchema = baseSchema.extend({
  name: z.string().min(1, 'resource name is required').max(200),
  description: optText,
  quantity: optText,
  notes: optText,
}) satisfies z.ZodType<Resource>

export const characterStateChangeSchema = baseSchema.extend({
  kind: stateChangeKindSchema,
  recordId: optText,
  field: z.string().min(1, 'field is required').max(200),
  oldValue: optText,
  newValue: optText,
  journalEntryId: optTextNull,
  note: optText,
}) satisfies z.ZodType<CharacterStateChange>

export const memorySchema = baseSchema.extend({
  code: z.string().min(1, 'memory code is required').max(20),
  title: z.string().min(1, 'memory title is required').max(300),
  text: z.string(),
  status: memoryStatusSchema,
  tags: z.array(z.string()),
  occurredEra: optText,
  recordedEra: optText,
  personIds: z.array(z.string()),
  placeIds: z.array(z.string()),
  journalEntryIds: z.array(z.string()),
  notes: optText,
}) satisfies z.ZodType<Memory>

export const memoryVersionSchema = baseSchema.extend({
  memoryId: id,
  version: z.number().int().min(1),
  text: z.string(),
  status: memoryStatusSchema,
  changedEra: optText,
  note: optText,
}) satisfies z.ZodType<MemoryVersion>

export const journalEntrySchema = baseSchema.extend({
  number: z.number().int().min(1, 'entry number must be at least 1'),
  title: z.string().min(1, 'entry title is required').max(300),
  era: z.string().min(1, 'era is required').max(200),
  age: ageSchema.optional(),
  location: optText,
  promptText: optText,
  promptRef: optText,
  promptSource: optText,
  body: z.string(),
  choices: optText,
  consequences: optText,
  longTerm: optText,
  memoryIds: z.array(z.string()),
  personIds: z.array(z.string()),
  placeIds: z.array(z.string()),
  threadIds: z.array(z.string()),
  pinned: z.boolean().optional(),
  tags: z.array(z.string()),
  privateNotes: optText,
  draft: z.boolean().optional(),
}) satisfies z.ZodType<JournalEntry>

export const journalEntryDraftSchema = baseSchema.extend({
  entryId: optTextNull,
  title: z.string().max(300),
  body: z.string(),
  era: z.string().max(200),
  promptText: optText,
  promptRef: optText,
}) satisfies z.ZodType<JournalEntryDraft>

export const timelineEventSchema = baseSchema.extend({
  title: z.string().min(1, 'event title is required').max(300),
  description: optText,
  era: z.string().min(1, 'era is required').max(200),
  sortYear: z.number().int().nullable().optional(),
  type: timelineEventTypeSchema,
  sourceId: optTextNull,
  personIds: z.array(z.string()),
  placeIds: z.array(z.string()),
}) satisfies z.ZodType<TimelineEvent>

export const personSchema = baseSchema.extend({
  name: z.string().min(1, 'person name is required').max(200),
  description: optText,
  firstAppearance: optText,
  lastKnownEra: optText,
  relationship: optText,
  wants: optText,
  status: z.string().min(1, 'status is required').max(200),
  notes: optText,
  memoryIds: z.array(z.string()),
  journalEntryIds: z.array(z.string()),
}) satisfies z.ZodType<Person>

export const relationshipSchema = baseSchema.extend({
  personId: id,
  description: z.string().min(1, 'description is required').max(2000),
  era: z.string().min(1, 'era is required').max(200),
}) satisfies z.ZodType<Relationship>

export const placeSchema = baseSchema.extend({
  name: z.string().min(1, 'place name is required').max(200),
  description: optText,
  region: optText,
  firstVisit: optText,
  lastVisit: optText,
  significance: optText,
  personIds: z.array(z.string()),
  memoryIds: z.array(z.string()),
  journalEntryIds: z.array(z.string()),
}) satisfies z.ZodType<Place>

export const storyThreadSchema = baseSchema.extend({
  title: z.string().min(1, 'thread title is required').max(300),
  description: optText,
  introducedEra: optText,
  status: threadStatusSchema,
  personIds: z.array(z.string()),
  placeIds: z.array(z.string()),
  memoryIds: z.array(z.string()),
  journalEntryIds: z.array(z.string()),
  resolutionNotes: optText,
}) satisfies z.ZodType<StoryThread>

export const recapSchema = baseSchema.extend({
  title: z.string().min(1, 'recap title is required').max(300),
  era: z.string().min(1, 'era is required').max(200),
  body: z.string(),
}) satisfies z.ZodType<Recap>

export const diceRollSchema = baseSchema.extend({
  dice: z.string().min(1, 'dice description is required').max(100),
  results: z.array(z.number().int()),
  total: z.number().int(),
  note: optText,
}) satisfies z.ZodType<DiceRoll>

export const promptNoteSchema = baseSchema.extend({
  text: z.string().min(1, 'prompt note text is required'),
  ref: optText,
  source: optText,
  era: optText,
  journalEntryId: optTextNull,
}) satisfies z.ZodType<PromptNote>

export const quickNoteSchema = baseSchema.extend({
  text: z.string().min(1, 'note text is required'),
  convertedTo: optTextNull,
}) satisfies z.ZodType<QuickNote>

export const endingSchema = baseSchema.extend({
  finalEra: z.string().min(1, 'final era is required').max(200),
  finalAge: ageSchema.optional(),
  finalLocation: optText,
  endingType: optText,
  whatLost: optText,
  whatEndured: optText,
  finalScene: optText,
  epilogue: optText,
}) satisfies z.ZodType<Ending>

export const appSettingsSchema = z.object({
  id: z.string().min(1),
  theme: themeSchema,
  activeChronicleId: z.string().nullable().optional(),
  lastExportAt: z.string().datetime({ offset: true }).nullable().optional(),
  editorFontSize: z.number().int().min(12).max(24).optional(),
}) satisfies z.ZodType<AppSettings>

/** Schema per Dexie table name — used by the export/import stub to validate rows. */
export const entitySchemas = {
  chronicles: chronicleSchema,
  skills: skillSchema,
  resources: resourceSchema,
  characterStateChanges: characterStateChangeSchema,
  memories: memorySchema,
  memoryVersions: memoryVersionSchema,
  journalEntries: journalEntrySchema,
  journalEntryDrafts: journalEntryDraftSchema,
  timelineEvents: timelineEventSchema,
  people: personSchema,
  relationships: relationshipSchema,
  places: placeSchema,
  storyThreads: storyThreadSchema,
  recaps: recapSchema,
  diceRolls: diceRollSchema,
  promptNotes: promptNoteSchema,
  quickNotes: quickNoteSchema,
  endings: endingSchema,
  settings: appSettingsSchema,
} as const

export type TableName = keyof typeof entitySchemas

/** Parse + validate one entity. Throws a ZodError on bad data. */
export function validateEntity<T extends TableName>(table: T, data: unknown): z.infer<(typeof entitySchemas)[T]> {
  return entitySchemas[table].parse(data)
}

/** Non-throwing check — useful for import, where one bad row must not kill the file. */
export function isValidEntity(table: TableName, data: unknown): boolean {
  return entitySchemas[table].safeParse(data).success
}
