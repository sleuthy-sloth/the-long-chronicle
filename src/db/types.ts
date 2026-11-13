// Shared entity types. Dexie tables + Zod schemas live in src/db/database.ts (Stream A).
// In-game dates are free-text era strings (e.g. "late 14th century"); never force a calendar date.
export type ID = string
export type ChronicleStatus = 'In Progress' | 'Paused' | 'Completed'
export type MemoryStatus = 'Active' | 'Lost' | 'Altered' | 'Archived'
export type ThreadStatus = 'Open' | 'Dormant' | 'Resolved' | 'Abandoned'
export interface Base { id: ID; chronicleId: ID; createdAt: string; updatedAt: string }
export interface Chronicle extends Base {
  title: string; vampireName: string; pronouns?: string; startingAge: number; currentAge: number
  startingEra: string; currentEra: string; startingLocation: string; currentLocation: string
  concept: string; tension?: string; status: ChronicleStatus; coverImage?: string
  lastExportAt?: string | null
}
export interface Skill extends Base { name: string; description?: string; value?: string; notes?: string }
export interface Resource extends Base { name: string; description?: string; quantity?: string; notes?: string }
export interface CharacterStateChange extends Base {
  kind: 'skill' | 'resource' | 'condition' | 'trait' | 'other'
  recordId?: string; field: string; oldValue?: string; newValue?: string
  journalEntryId?: string | null; note?: string
}
export interface Memory extends Base {
  code: string; title: string; text: string; status: MemoryStatus
  tags: string[]; occurredEra?: string; recordedEra?: string
  personIds: string[]; placeIds: string[]; journalEntryIds: string[]; notes?: string
}
export interface MemoryVersion extends Base {
  memoryId: string; version: number; text: string; status: MemoryStatus
  changedEra?: string; note?: string
}
export interface JournalEntry extends Base {
  number: number; title: string; era: string; age?: number; location?: string
  promptText?: string; promptRef?: string; promptSource?: string
  body: string; choices?: string; consequences?: string; longTerm?: string
  memoryIds: string[]; personIds: string[]; placeIds: string[]; threadIds: string[]
  pinned?: boolean; tags: string[]; privateNotes?: string; draft?: boolean
}
export interface JournalEntryDraft extends Base { entryId?: string | null; title: string; body: string; era: string; promptText?: string; promptRef?: string }
export interface TimelineEvent extends Base {
  title: string; description?: string; era: string; sortYear?: number | null
  type: 'journal' | 'memory' | 'historical' | 'relationship' | 'location' | 'skill' | 'resource' | 'custom'
  sourceId?: string | null; personIds: string[]; placeIds: string[]
}
export interface Person extends Base {
  name: string; description?: string; firstAppearance?: string; lastKnownEra?: string
  relationship?: string; wants?: string; status: string; notes?: string
  memoryIds: string[]; journalEntryIds: string[]
}
export interface Relationship extends Base { personId: string; description: string; era: string }
export interface Place extends Base {
  name: string; description?: string; region?: string; firstVisit?: string; lastVisit?: string
  significance?: string; personIds: string[]; memoryIds: string[]; journalEntryIds: string[]
}
export interface StoryThread extends Base {
  title: string; description?: string; introducedEra?: string; status: ThreadStatus
  personIds: string[]; placeIds: string[]; memoryIds: string[]; journalEntryIds: string[]; resolutionNotes?: string
}
export interface Recap extends Base { title: string; era: string; body: string }
export interface DiceRoll extends Base { dice: string; results: number[]; total: number; note?: string }
export interface PromptNote extends Base { text: string; ref?: string; source?: string; era?: string; journalEntryId?: string | null }
export interface QuickNote extends Base { text: string; convertedTo?: string | null }
export interface Ending extends Base { finalEra: string; finalAge?: number; finalLocation?: string; endingType?: string; whatLost?: string; whatEndured?: string; finalScene?: string; epilogue?: string }
export interface AppSettings { id: string; theme: 'light' | 'dark' | 'system'; activeChronicleId?: string | null; lastExportAt?: string | null; editorFontSize?: number }
export const newId = () => (typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`)
export const nowIso = () => new Date().toISOString()
