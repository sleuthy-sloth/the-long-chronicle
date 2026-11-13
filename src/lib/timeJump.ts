// Time-jump helper (Feature 2): "Centuries pass."
//
// One call moves the vampire forward in time: the chronicle's current
// era / age / location advance, a CharacterStateChange records the jump in
// the change history, and a TimelineEvent of type 'timeJump' marks the
// moment on the timeline. The three writes happen in ONE Dexie transaction,
// so a jump is never half-recorded.
//
// An age decrease is only a correction, never a jump: it is rejected unless
// the caller passes `allowAgeDecrease: true` (the dialog asks the player to
// confirm the correction explicitly). Eras are free text — vague eras like
// "some decades later" are allowed.
//
// Snapshots are a parallel stream's module (src/lib/snapshots.ts), so the
// snapshot function is injected: pass `createSnapshot` and set
// `takeSnapshot: true` to freeze the character at the NEW era before play
// resumes there. The snapshot call runs after the jump transaction commits
// — a snapshot failure must not roll back a jump that already happened, and
// the injected function may write to its own tables outside this
// transaction's scope.
import { db } from './localDb'
import { chronicleSchema, validateEntity } from '../db/validation'
import { newId, nowIso } from '../db/types'
import type { CharacterStateChange, Chronicle, TimelineEvent } from '../db/types'

export interface TimeJumpInput {
  /** Free text — a dated era or a vague one ("some decades later"). */
  newEra: string
  newAge: number
  newLocation: string
  /** Optional note recorded on both the state change and the timeline event. */
  note?: string
  /** Freeze the character sheet at the new era (default: true in the UI). */
  takeSnapshot?: boolean
  /** Set only when the player explicitly confirmed an age correction. */
  allowAgeDecrease?: boolean
  /**
   * Injected snapshot creator (src/lib/snapshots.ts, parallel stream).
   * Called with the NEW era / age / location and sourceKind 'timeJump'.
   */
  createSnapshot?: (
    chronicleId: string,
    opts: { era: string; age?: number; location?: string; sourceId?: string | null; sourceKind: 'timeJump' },
  ) => Promise<unknown>
}

export interface TimeJumpResult {
  chronicle: Chronicle
  stateChange: CharacterStateChange
  timelineEvent: TimelineEvent
  /** Whatever the injected snapshot function returned, if one ran. */
  snapshot?: unknown
}

export async function performTimeJump(
  chronicleId: string,
  input: TimeJumpInput,
): Promise<TimeJumpResult> {
  const chronicle = await db.chronicles.get(chronicleId)
  if (!chronicle) throw new Error(`Chronicle not found: ${chronicleId}`)

  const newEra = input.newEra.trim()
  const newLocation = input.newLocation.trim()
  if (!newEra) throw new Error('A new era is required for a time jump.')
  if (!newLocation) throw new Error('A new location is required for a time jump.')
  if (!Number.isInteger(input.newAge) || input.newAge < 0) {
    throw new Error('The new age must be a whole number of zero or more.')
  }
  if (input.newAge < chronicle.currentAge && input.allowAgeDecrease !== true) {
    throw new Error(
      `The new age (${input.newAge}) is lower than the current age (${chronicle.currentAge}). ` +
        'A time jump cannot make the vampire younger — if this is a correction to the record, confirm it explicitly.',
    )
  }

  const now = nowIso()
  const note = input.note?.trim() || undefined
  const fromSummary = `${chronicle.currentEra} · age ${chronicle.currentAge} · ${chronicle.currentLocation}`
  const toSummary = `${newEra} · age ${input.newAge} · ${newLocation}`

  const updatedChronicle = chronicleSchema.parse({
    ...chronicle,
    currentEra: newEra,
    currentAge: input.newAge,
    currentLocation: newLocation,
    updatedAt: now,
  })
  // CharacterStateChange convention (see src/db/database.ts addStateEntry):
  // kind 'other' for free-text / non-skill, non-resource changes, with a
  // descriptive field and old → new values. The jump is one history row.
  const stateChange = validateEntity('characterStateChanges', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    kind: 'other',
    field: 'timeJump',
    oldValue: fromSummary,
    newValue: toSummary,
    journalEntryId: null,
    note: note ?? `Centuries pass: ${fromSummary} → ${toSummary}`,
  })
  const timelineEvent = validateEntity('timelineEvents', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    title: `Centuries pass — ${newEra}`,
    description: note ? `${note}\n${fromSummary} → ${toSummary}` : `${fromSummary} → ${toSummary}`,
    era: newEra,
    sortYear: null,
    type: 'timeJump',
    sourceId: null,
    personIds: [],
    placeIds: [],
  })

  await db.transaction(
    'rw',
    db.chronicles,
    db.characterStateChanges,
    db.timelineEvents,
    async () => {
      await db.chronicles.put(updatedChronicle)
      await db.characterStateChanges.put(stateChange)
      await db.timelineEvents.put(timelineEvent)
    },
  )

  let snapshot: unknown
  if (input.takeSnapshot === true && input.createSnapshot) {
    snapshot = await input.createSnapshot(chronicleId, {
      era: newEra,
      age: input.newAge,
      location: newLocation,
      sourceId: timelineEvent.id,
      sourceKind: 'timeJump',
    })
  }

  return { chronicle: updatedChronicle, stateChange, timelineEvent, snapshot }
}
