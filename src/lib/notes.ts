// Dice-roll history and quick notes (Stream C).
//
// Dice rolls persist as DiceRoll rows so the history survives a reload.
// Quick notes are temporary by design; "Convert to…" creates the target
// record (journal entry / memory / person / place / thread) with the note
// text prefilled, then marks the note converted — the note itself is kept
// as a receipt of where the idea went.
import { db } from './localDb'
import { validateEntity } from '../db/validation'
import { newId, nowIso } from '../db/types'
import type { DiceRoll, QuickNote } from '../db/types'
import type { RollResult } from './dice'
import { makeDiceRoll } from './dice'
import { createPerson, createPlace } from './people'
import { createThread } from './threads'
import { createMemory } from './memories'

// ---------------------------------------------------------------------------
// Dice-roll history
// ---------------------------------------------------------------------------

export async function listDiceRolls(chronicleId: string): Promise<DiceRoll[]> {
  const rows = await db.diceRolls.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Persist a roll result. Returns the saved DiceRoll row. */
export async function saveDiceRoll(
  chronicleId: string,
  result: RollResult,
  note?: string,
): Promise<DiceRoll> {
  const row = validateEntity('diceRolls', makeDiceRoll(chronicleId, result, note))
  await db.diceRolls.put(row)
  return row
}

export async function clearDiceRolls(chronicleId: string): Promise<void> {
  await db.diceRolls.where('chronicleId').equals(chronicleId).delete()
}

// ---------------------------------------------------------------------------
// Quick notes
// ---------------------------------------------------------------------------

export async function listQuickNotes(chronicleId: string): Promise<QuickNote[]> {
  const rows = await db.quickNotes.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createQuickNote(chronicleId: string, text: string): Promise<QuickNote> {
  const now = nowIso()
  const note = validateEntity('quickNotes', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    text: text.trim(),
    convertedTo: null,
  })
  await db.quickNotes.put(note)
  return note
}

export async function deleteQuickNote(id: string): Promise<void> {
  await db.quickNotes.delete(id)
}

export type QuickNoteTarget = 'journal' | 'memory' | 'person' | 'place' | 'thread'

export const QUICK_NOTE_TARGETS: Array<{ value: QuickNoteTarget; label: string }> = [
  { value: 'journal', label: 'Journal entry (as a draft)' },
  { value: 'memory', label: 'Memory' },
  { value: 'person', label: 'Person' },
  { value: 'place', label: 'Place' },
  { value: 'thread', label: 'Story thread' },
]

export interface ConvertedNoteResult {
  note: QuickNote
  target: QuickNoteTarget
  targetId: string
}

/**
 * Convert a quick note into a real record, prefilled with the note text,
 * and mark the note converted (convertedTo records "type:id"). The note
 * row is kept — conversion is a promotion, not a move.
 *
 * Journal conversion creates a draft (JournalEntryDraft) rather than a
 * numbered entry, because a note is a starting point, not a finished
 * entry; the player finishes it in the Journal editor.
 */
export async function convertQuickNote(
  noteId: string,
  target: QuickNoteTarget,
): Promise<ConvertedNoteResult> {
  const note = await db.quickNotes.get(noteId)
  if (!note) throw new Error(`Quick note not found: ${noteId}`)
  if (note.convertedTo) throw new Error('This note has already been converted.')
  const text = note.text
  let targetId: string

  if (target === 'journal') {
    const now = nowIso()
    const draft = validateEntity('journalEntryDrafts', {
      id: newId(),
      chronicleId: note.chronicleId,
      createdAt: now,
      updatedAt: now,
      entryId: null,
      title: '',
      body: text,
      era: '',
    })
    await db.journalEntryDrafts.put(draft)
    targetId = draft.id
  } else if (target === 'memory') {
    const memory = await createMemory(note.chronicleId, {
      title: text.split('\n')[0].slice(0, 120) || 'Untitled memory',
      text,
    })
    targetId = memory.id
  } else if (target === 'person') {
    const person = await createPerson(note.chronicleId, { name: text.split('\n')[0].slice(0, 120) || 'Unnamed person', notes: text })
    targetId = person.id
  } else if (target === 'place') {
    const place = await createPlace(note.chronicleId, { name: text.split('\n')[0].slice(0, 120) || 'Unnamed place', description: text })
    targetId = place.id
  } else {
    const thread = await createThread(note.chronicleId, {
      title: text.split('\n')[0].slice(0, 120) || 'Untitled thread',
      description: text,
    })
    targetId = thread.id
  }

  const updated = validateEntity('quickNotes', {
    ...note,
    convertedTo: `${target}:${targetId}`,
    updatedAt: nowIso(),
  })
  await db.quickNotes.put(updated)
  return { note: updated, target, targetId }
}
