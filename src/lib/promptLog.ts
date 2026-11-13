// Used-prompt log (Feature 1).
//
// A prompt counts as "used" when it led to play, from two sources:
//   (a) a journal entry saved carrying prompt text (promptText / promptRef /
//       promptSource on the entry), and
//   (b) a prompt note explicitly marked used (PromptNote.used === true).
// Everything here is player-entered text — no prompt tables or rulebook
// content are bundled anywhere in this app.
//
// The log is derived, not stored: entries and notes stay the source of
// truth, so the log can never disagree with them. Marking a note used only
// flips its `used` / `usedAt` fields.
import { db } from './localDb'
import { validateEntity } from '../db/validation'
import { nowIso } from '../db/types'
import type { JournalEntry, PromptNote } from '../db/types'

export type UsedPromptOrigin = 'journalEntry' | 'promptNote'

export interface UsedPrompt {
  /** Stable key for rendering: `entry:<id>` or `note:<id>`. */
  id: string
  /** The prompt text, as the player wrote it. */
  text: string
  ref?: string
  source?: string
  /** Free-text era the prompt was used in. */
  era: string
  /** Journal entry the prompt led to, if any. */
  journalEntryId: string | null
  /** When the prompt was used (entry's last save, or the note's usedAt). */
  usedAt: string
  createdAt: string
  origin: UsedPromptOrigin
  /** Set for note-origin items, so the UI can offer "mark as unused". */
  promptNoteId: string | null
}

function entryToUsedPrompt(entry: JournalEntry): UsedPrompt {
  return {
    id: `entry:${entry.id}`,
    text: entry.promptText!.trim(),
    ref: entry.promptRef?.trim() || undefined,
    source: entry.promptSource?.trim() || undefined,
    era: entry.era,
    journalEntryId: entry.id,
    usedAt: entry.updatedAt,
    createdAt: entry.createdAt,
    origin: 'journalEntry',
    promptNoteId: null,
  }
}

function noteToUsedPrompt(note: PromptNote): UsedPrompt {
  return {
    id: `note:${note.id}`,
    text: note.text.trim(),
    ref: note.ref?.trim() || undefined,
    source: note.source?.trim() || undefined,
    era: note.era?.trim() || '',
    journalEntryId: note.journalEntryId ?? null,
    usedAt: note.usedAt ?? note.updatedAt,
    createdAt: note.createdAt,
    origin: 'promptNote',
    promptNoteId: note.id,
  }
}

function newestFirst(a: UsedPrompt, b: UsedPrompt): number {
  return b.usedAt.localeCompare(a.usedAt) || b.createdAt.localeCompare(a.createdAt)
}

/**
 * Every used prompt for a chronicle, newest first.
 *
 * A used note linked to an entry whose prompt text is the same note text is
 * listed once (via the entry) — the note and the entry describe the same
 * moment of play, not two.
 */
export async function listUsedPrompts(chronicleId: string): Promise<UsedPrompt[]> {
  const [entries, notes] = await Promise.all([
    db.journalEntries.where('chronicleId').equals(chronicleId).toArray(),
    db.promptNotes.where('chronicleId').equals(chronicleId).toArray(),
  ])
  const fromEntries = entries
    .filter((e) => e.promptText?.trim())
    .map(entryToUsedPrompt)
  // Entry prompt texts, keyed by entry id, for the dedupe below.
  const entryPromptById = new Map(
    entries.filter((e) => e.promptText?.trim()).map((e) => [e.id, e.promptText!.trim().toLowerCase()]),
  )
  const fromNotes = notes
    .filter((n) => n.used === true)
    .filter((n) => {
      // Same prompt already recorded through its journal entry: skip the duplicate.
      if (n.journalEntryId && entryPromptById.get(n.journalEntryId) === n.text.trim().toLowerCase()) return false
      return true
    })
    .map(noteToUsedPrompt)
  return [...fromEntries, ...fromNotes].sort(newestFirst)
}

export interface UsedPromptSearch {
  /** Substring match against prompt text, ref, and source (case-insensitive). */
  text?: string
  /** Substring match against the era (case-insensitive, free text). */
  era?: string
}

/** Filtered view of {@link listUsedPrompts}; both filters are optional. */
export async function searchUsedPrompts(
  chronicleId: string,
  filters: UsedPromptSearch = {},
): Promise<UsedPrompt[]> {
  const all = await listUsedPrompts(chronicleId)
  const text = filters.text?.trim().toLowerCase()
  const era = filters.era?.trim().toLowerCase()
  return all.filter((p) => {
    if (text && ![p.text, p.ref ?? '', p.source ?? ''].join(' ').toLowerCase().includes(text)) return false
    if (era && !p.era.toLowerCase().includes(era)) return false
    return true
  })
}

/** How many prompts have been used in this chronicle. */
export async function countUsedPrompts(chronicleId: string): Promise<number> {
  return (await listUsedPrompts(chronicleId)).length
}

/**
 * Mark a prompt note used (or, with `used = false`, unmark it). Marking
 * stamps `usedAt` with now; unmarking clears it. Returns the updated note.
 */
export async function markPromptNoteUsed(promptNoteId: string, used = true): Promise<PromptNote> {
  const note = await db.promptNotes.get(promptNoteId)
  if (!note) throw new Error(`Prompt note not found: ${promptNoteId}`)
  const updated = validateEntity('promptNotes', {
    ...note,
    used,
    usedAt: used ? nowIso() : null,
    updatedAt: nowIso(),
  })
  await db.promptNotes.put(updated)
  return updated
}

/** Convenience wrapper for unmarking — same as `markPromptNoteUsed(id, false)`. */
export async function unmarkPromptNoteUsed(promptNoteId: string): Promise<PromptNote> {
  return markPromptNoteUsed(promptNoteId, false)
}

/** Whether a prompt note is currently marked used. */
export async function isPromptUsed(promptNoteId: string): Promise<boolean> {
  const note = await db.promptNotes.get(promptNoteId)
  if (!note) throw new Error(`Prompt note not found: ${promptNoteId}`)
  return note.used === true
}

/** All prompt notes for a chronicle, newest first (used and unused alike). */
export async function listPromptNotes(chronicleId: string): Promise<PromptNote[]> {
  const rows = await db.promptNotes.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Prompt notes not yet tied to play: not marked used and not linked to a
 * journal entry. These are the ones the Prompt Log offers a "mark as used"
 * affordance for — prompt notes have no other listing in the UI (the dice
 * roller only saves them), so the log is where they surface.
 */
export async function listUnlinkedPromptNotes(chronicleId: string): Promise<PromptNote[]> {
  const rows = await listPromptNotes(chronicleId)
  return rows.filter((n) => n.used !== true && !n.journalEntryId)
}
