// @vitest-environment node
// Feature 4 tests: Character Snapshots per Era — create captures the live
// skills/resources/conditions, list ordering, diff (added/removed/changed),
// delete, and immutability at the module level (no update function is
// exported). All test content is invented placeholder text written for
// these tests.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '../src/db/database'
import { seedTestChronicle } from './seed-chronicle'
import { newId, nowIso } from '../src/db/types'
import type { CharacterSnapshot } from '../src/db/types'
import * as snapshots from '../src/lib/snapshots'
import {
  createCharacterSnapshot,
  deleteSnapshot,
  diffSnapshots,
  listSnapshots,
} from '../src/lib/snapshots'

beforeEach(async () => {
  await resetDb()
})

function fakeSnapshot(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  const now = nowIso()
  return {
    id: newId(),
    chronicleId: 'chronicle-x',
    createdAt: now,
    updatedAt: now,
    era: 'late 14th century',
    skills: [],
    resources: [],
    conditions: [],
    ...overrides,
  }
}

async function addStateEntry(
  chronicleId: string,
  kind: 'skill' | 'resource' | 'condition' | 'trait' | 'other',
  field: string,
  newValue?: string,
  createdAt?: string,
) {
  const now = createdAt ?? nowIso()
  await db.characterStateChanges.put({
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    kind,
    field,
    newValue,
  })
}

describe('createCharacterSnapshot', () => {
  it('captures live skills, resources and conditions', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    await addStateEntry(chronicleId, 'condition', 'Sunlight sensitivity', 'Avoids direct daylight')
    await addStateEntry(chronicleId, 'trait', 'Patient')
    // These must NOT end up in conditions: a skill change, and the
    // self-description record (a living field, not a condition).
    await addStateEntry(chronicleId, 'skill', 'value', 'Master')
    await addStateEntry(chronicleId, 'other', 'selfDescription', 'Sample self-description: a keeper of letters.')

    const snap = await createCharacterSnapshot(chronicleId, { era: 'early 16th century' })
    expect(snap.era).toBe('early 16th century')
    expect(snap.sourceKind).toBe('manual')
    expect(snap.sourceId).toBeNull()
    expect(snap.skills).toEqual([
      { name: 'Lockpicking', value: 'Experienced', description: 'Sample skill: opening old locks quietly.' },
    ])
    expect(snap.resources).toEqual([
      { name: 'A brass key', value: '1', description: 'Sample resource: a key with no known lock.' },
    ])
    expect(snap.conditions).toEqual(['Patient', 'Sunlight sensitivity — Avoids direct daylight'])
  })

  it('reads era, age and location from the chronicle when omitted', async () => {
    const seed = await seedTestChronicle()
    // Empty era + no age/location: fall back to the chronicle's current values.
    const snap = await createCharacterSnapshot(seed.chronicle.id, { era: '' })
    expect(snap.era).toBe('early 16th century')
    expect(snap.age).toBe(214)
    expect(snap.location).toBe('Sample town: Dunmere')
  })

  it('uses explicit era, age and location when given', async () => {
    const seed = await seedTestChronicle()
    const snap = await createCharacterSnapshot(seed.chronicle.id, {
      era: 'late 15th century',
      age: 180,
      location: 'Sample town: Elsewhere',
      sourceKind: 'timeJump',
      sourceId: 'event-1',
    })
    expect(snap.era).toBe('late 15th century')
    expect(snap.age).toBe(180)
    expect(snap.location).toBe('Sample town: Elsewhere')
    expect(snap.sourceKind).toBe('timeJump')
    expect(snap.sourceId).toBe('event-1')
  })

  it('keeps the most recent entry when a condition name repeats', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    await addStateEntry(chronicleId, 'condition', 'Restless', 'Paces at night', '2020-01-01T00:00:00.000Z')
    await addStateEntry(chronicleId, 'condition', 'Restless', 'Sleeps soundly now', '2026-01-01T00:00:00.000Z')
    const snap = await createCharacterSnapshot(chronicleId, { era: 'early 16th century' })
    expect(snap.conditions).toEqual(['Restless — Sleeps soundly now'])
  })

  it('throws for an unknown chronicle', async () => {
    await expect(createCharacterSnapshot('no-such-id', { era: 'early 16th century' })).rejects.toThrow(
      /Chronicle not found/,
    )
  })
})

describe('listSnapshots', () => {
  it('returns snapshots newest first', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    const first = await createCharacterSnapshot(chronicleId, { era: 'late 14th century' })
    // Pin the first snapshot's stamp in the past so ordering is deterministic.
    await db.characterSnapshots.update(first.id, { createdAt: '2020-01-01T00:00:00.000Z' })
    const second = await createCharacterSnapshot(chronicleId, { era: 'early 16th century' })
    const rows = await listSnapshots(chronicleId)
    expect(rows.map((s) => s.id)).toEqual([second.id, first.id])
  })

  it('is empty for a chronicle with no snapshots', async () => {
    const seed = await seedTestChronicle()
    expect(await listSnapshots(seed.chronicle.id)).toEqual([])
  })
})

describe('diffSnapshots', () => {
  it('reports added, removed and changed skills/resources and conditions', () => {
    const a = fakeSnapshot({
      skills: [
        { name: 'Lockpicking', value: 'Experienced' },
        { name: 'Glassblowing', value: 'Novice' },
      ],
      resources: [{ name: 'A brass key', value: '1' }],
      conditions: ['Sunlight sensitivity', 'Patient'],
    })
    const b = fakeSnapshot({
      skills: [
        { name: 'Lockpicking', value: 'Master' },
        { name: 'Calligraphy', value: 'Adept' },
      ],
      resources: [
        { name: 'A brass key', value: '1' },
        { name: 'A quiet house', value: '1' },
      ],
      conditions: ['Patient', 'Restless'],
    })
    const diff = diffSnapshots(a, b)
    expect(diff.addedSkills).toEqual([{ name: 'Calligraphy', value: 'Adept' }])
    expect(diff.removedSkills).toEqual([{ name: 'Glassblowing', value: 'Novice' }])
    expect(diff.changedSkills).toEqual([
      { name: 'Lockpicking', from: { name: 'Lockpicking', value: 'Experienced' }, to: { name: 'Lockpicking', value: 'Master' } },
    ])
    expect(diff.addedResources).toEqual([{ name: 'A quiet house', value: '1' }])
    expect(diff.removedResources).toEqual([])
    expect(diff.changedResources).toEqual([])
    expect(diff.addedConditions).toEqual(['Restless'])
    expect(diff.removedConditions).toEqual(['Sunlight sensitivity'])
  })

  it('treats a description change as a change, and identical snapshots as no diff', () => {
    const a = fakeSnapshot({
      skills: [{ name: 'Lockpicking', value: 'Experienced', description: 'Old description.' }],
    })
    const b = fakeSnapshot({
      skills: [{ name: 'Lockpicking', value: 'Experienced', description: 'New description.' }],
    })
    const diff = diffSnapshots(a, b)
    expect(diff.changedSkills).toHaveLength(1)
    expect(diff.addedSkills).toEqual([])
    expect(diff.removedSkills).toEqual([])

    expect(diffSnapshots(a, fakeSnapshot({ skills: a.skills }))).toEqual({
      addedSkills: [],
      removedSkills: [],
      changedSkills: [],
      addedResources: [],
      removedResources: [],
      changedResources: [],
      addedConditions: [],
      removedConditions: [],
    })
  })

  it('reflects live changes between two real snapshots', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    const first = await createCharacterSnapshot(chronicleId, { era: 'late 14th century' })

    // Between snapshots: the skill improves, a new skill is learned, the
    // resource is given away, and a new condition appears.
    const skill = (await db.skills.where('chronicleId').equals(chronicleId).toArray())[0]
    const resource = (await db.resources.where('chronicleId').equals(chronicleId).toArray())[0]
    const now = nowIso()
    await db.skills.update(skill.id, { value: 'Master' })
    await db.skills.put({
      id: newId(), chronicleId, createdAt: now, updatedAt: now,
      name: 'Calligraphy', value: 'Adept', description: 'Sample skill: a steady hand for letters.',
    })
    await db.resources.delete(resource.id)
    await addStateEntry(chronicleId, 'condition', 'Restless', 'Paces at night')

    const second = await createCharacterSnapshot(chronicleId, { era: 'early 16th century' })
    const diff = diffSnapshots(first, second)
    expect(diff.changedSkills.map((c) => c.name)).toEqual(['Lockpicking'])
    expect(diff.changedSkills[0].from.value).toBe('Experienced')
    expect(diff.changedSkills[0].to.value).toBe('Master')
    expect(diff.addedSkills.map((s) => s.name)).toEqual(['Calligraphy'])
    expect(diff.removedResources.map((r) => r.name)).toEqual(['A brass key'])
    expect(diff.addedConditions).toEqual(['Restless — Paces at night'])
  })
})

describe('deleteSnapshot', () => {
  it('removes the snapshot and leaves the others', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    const first = await createCharacterSnapshot(chronicleId, { era: 'late 14th century' })
    const second = await createCharacterSnapshot(chronicleId, { era: 'early 16th century' })
    await deleteSnapshot(first.id)
    const rows = await listSnapshots(chronicleId)
    expect(rows.map((s) => s.id)).toEqual([second.id])
  })

  it('is a no-op for an unknown id', async () => {
    await expect(deleteSnapshot('no-such-id')).resolves.toBeUndefined()
  })
})

describe('snapshots are immutable at the module level', () => {
  it('exports no update function', () => {
    expect('updateSnapshot' in snapshots).toBe(false)
    expect('updateCharacterSnapshot' in snapshots).toBe(false)
    expect(Object.keys(snapshots).sort()).toEqual([
      'createCharacterSnapshot',
      'currentConditions',
      'deleteSnapshot',
      'diffSnapshots',
      'listSnapshots',
    ])
  })
})
