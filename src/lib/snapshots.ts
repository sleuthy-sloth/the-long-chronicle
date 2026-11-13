// Character snapshots (Stream B, Feature 4).
//
// A snapshot is an immutable frozen copy of the character sheet — skills,
// resources and conditions as they stood at one era. Snapshots are never
// edited: there is deliberately no update function in this module. To
// record a later state, take a new snapshot; to remove one, delete it.
//
// The snapshot reads the live tables at capture time:
// - skills / resources: the live `skills` / `resources` tables.
// - conditions: the character state-change entries, using the same filter
//   the Character page uses to show them — kind 'condition' or 'trait', or
//   kind 'other' except the self-description record (which is a living
//   field, not a condition). If the same condition name appears more than
//   once, the most recent entry wins.
//
// Another stream imports `createCharacterSnapshot` only as an injected
// callback (for time-jump / journal-entry capture); its signature is part
// of the cross-stream contract — do not change it.
import { db } from './localDb'
import { characterSnapshotSchema } from '../db/validation'
import type { CharacterSnapshot, SnapshotItem } from '../db/types'
import { newId, nowIso } from '../db/types'

export type SnapshotSourceKind = 'journalEntry' | 'timeJump' | 'manual'

export interface CreateSnapshotOptions {
  era: string
  age?: number
  location?: string
  sourceId?: string | null
  sourceKind?: SnapshotSourceKind
}

export interface ChangedItem {
  name: string
  from: SnapshotItem
  to: SnapshotItem
}

export interface SnapshotDiff {
  addedSkills: SnapshotItem[]
  removedSkills: SnapshotItem[]
  changedSkills: ChangedItem[]
  addedResources: SnapshotItem[]
  removedResources: SnapshotItem[]
  changedResources: ChangedItem[]
  addedConditions: string[]
  removedConditions: string[]
}

/**
 * Read the current conditions from the state-change history, mirroring the
 * Character page: conditions, traits and compulsions (kind 'other'), but
 * never the self-description record. Most recent entry per name wins.
 */
export async function currentConditions(chronicleId: string): Promise<string[]> {
  const changes = await db.characterStateChanges.where('chronicleId').equals(chronicleId).toArray()
  // Newest first, so the first entry seen per name is the current one.
  changes.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const seen = new Set<string>()
  const conditions: string[] = []
  for (const c of changes) {
    const isCondition =
      c.kind === 'condition' || c.kind === 'trait' || (c.kind === 'other' && c.field !== 'selfDescription')
    if (!isCondition) continue
    if (seen.has(c.field)) continue
    seen.add(c.field)
    conditions.push(c.newValue ? `${c.field} — ${c.newValue}` : c.field)
  }
  return conditions.sort((a, b) => a.localeCompare(b))
}

/**
 * Freeze the character sheet as it stands now. Era, age and location
 * default to the chronicle's current values when omitted; pass them
 * explicitly to snapshot a different moment (e.g. a time jump). Skills
 * and resources are copied from the live tables; conditions from the
 * state-change history. sourceKind defaults to 'manual'.
 */
export async function createCharacterSnapshot(
  chronicleId: string,
  opts: CreateSnapshotOptions,
): Promise<CharacterSnapshot> {
  const chronicle = await db.chronicles.get(chronicleId)
  if (!chronicle) throw new Error(`Chronicle not found: ${chronicleId}`)
  const [skills, resources, conditions] = await Promise.all([
    db.skills.where('chronicleId').equals(chronicleId).toArray(),
    db.resources.where('chronicleId').equals(chronicleId).toArray(),
    currentConditions(chronicleId),
  ])
  const now = nowIso()
  const snapshot = characterSnapshotSchema.parse({
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    era: opts.era?.trim() || chronicle.currentEra,
    age: opts.age ?? chronicle.currentAge,
    location: opts.location?.trim() || chronicle.currentLocation,
    skills: skills
      .map((s): SnapshotItem => ({ name: s.name, value: s.value, description: s.description }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    resources: resources
      .map((r): SnapshotItem => ({ name: r.name, value: r.quantity, description: r.description }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    conditions,
    sourceId: opts.sourceId ?? null,
    sourceKind: opts.sourceKind ?? 'manual',
  })
  await db.characterSnapshots.put(snapshot)
  return snapshot
}

/** All snapshots for a chronicle, newest first. */
export async function listSnapshots(chronicleId: string): Promise<CharacterSnapshot[]> {
  const rows = await db.characterSnapshots.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Delete a snapshot. Snapshots are never edited — only removed. */
export async function deleteSnapshot(id: string): Promise<void> {
  await db.characterSnapshots.delete(id)
}

function diffItems(a: SnapshotItem[], b: SnapshotItem[]): {
  added: SnapshotItem[]
  removed: SnapshotItem[]
  changed: ChangedItem[]
} {
  const aByName = new Map(a.map((item) => [item.name, item]))
  const bByName = new Map(b.map((item) => [item.name, item]))
  const added: SnapshotItem[] = []
  const removed: SnapshotItem[] = []
  const changed: ChangedItem[] = []
  for (const item of b) {
    const before = aByName.get(item.name)
    if (!before) {
      added.push(item)
    } else if (before.value !== item.value || before.description !== item.description) {
      changed.push({ name: item.name, from: before, to: item })
    }
  }
  for (const item of a) {
    if (!bByName.has(item.name)) removed.push(item)
  }
  return { added, removed, changed }
}

/**
 * Compare two snapshots, `a` (earlier) against `b` (later). Items are
 * matched by name; "changed" means the same name with a different value
 * or description. Conditions are plain strings, so they only add/remove.
 */
export function diffSnapshots(a: CharacterSnapshot, b: CharacterSnapshot): SnapshotDiff {
  const skills = diffItems(a.skills, b.skills)
  const resources = diffItems(a.resources, b.resources)
  const aConditions = new Set(a.conditions)
  const bConditions = new Set(b.conditions)
  return {
    addedSkills: skills.added,
    removedSkills: skills.removed,
    changedSkills: skills.changed,
    addedResources: resources.added,
    removedResources: resources.removed,
    changedResources: resources.changed,
    addedConditions: b.conditions.filter((c) => !aConditions.has(c)),
    removedConditions: a.conditions.filter((c) => !bConditions.has(c)),
  }
}
