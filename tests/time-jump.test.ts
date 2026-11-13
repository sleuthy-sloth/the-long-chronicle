// @vitest-environment node
// Feature 2 tests: the time-jump helper moves the chronicle forward in
// one transaction (chronicle + state change + timeline event), refuses an
// unconfirmed age decrease, and calls the injected snapshot creator.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, resetDb } from '../src/db/database'
import { seedTestChronicle } from './seed-chronicle'
import { performTimeJump } from '../src/lib/timeJump'

beforeEach(async () => {
  await resetDb()
})

describe('performTimeJump', () => {
  it('updates the chronicle and writes a state change + timeline event', async () => {
    const seed = await seedTestChronicle()
    const cid = seed.chronicle.id
    const stateBefore = await db.characterStateChanges.where('chronicleId').equals(cid).count()
    const eventsBefore = await db.timelineEvents.where('chronicleId').equals(cid).count()

    const result = await performTimeJump(cid, {
      newEra: 'late 17th century',
      newAge: 350,
      newLocation: 'Sample town: the northern port',
      note: 'Sample jump note: the vampire kept to the coast road.',
    })

    const chronicle = await db.chronicles.get(cid)
    expect(chronicle?.currentEra).toBe('late 17th century')
    expect(chronicle?.currentAge).toBe(350)
    expect(chronicle?.currentLocation).toBe('Sample town: the northern port')
    // Starting values are untouched — only "current" moves.
    expect(chronicle?.startingEra).toBe('late 14th century')
    expect(chronicle?.startingAge).toBe(23)
    expect(result.chronicle.currentEra).toBe('late 17th century')

    const changes = await db.characterStateChanges.where('chronicleId').equals(cid).toArray()
    expect(changes).toHaveLength(stateBefore + 1)
    const jump = changes.find((c) => c.field === 'timeJump')!
    expect(jump.kind).toBe('other')
    expect(jump.oldValue).toContain('early 16th century')
    expect(jump.oldValue).toContain('214')
    expect(jump.newValue).toContain('late 17th century')
    expect(jump.newValue).toContain('350')
    expect(jump.note).toContain('Sample jump note')
    expect(result.stateChange.id).toBe(jump.id)

    const events = await db.timelineEvents.where('chronicleId').equals(cid).toArray()
    expect(events).toHaveLength(eventsBefore + 1)
    const event = events.find((e) => e.type === 'timeJump')!
    expect(event.era).toBe('late 17th century')
    expect(event.title).toContain('late 17th century')
    expect(event.description).toContain('Sample jump note')
    expect(event.description).toContain('early 16th century')
    expect(result.timelineEvent.id).toBe(event.id)
  })

  it('accepts a vague free-text era', async () => {
    const seed = await seedTestChronicle()
    const result = await performTimeJump(seed.chronicle.id, {
      newEra: 'some decades later',
      newAge: 260,
      newLocation: 'Sample town: Dunmere',
    })
    expect(result.chronicle.currentEra).toBe('some decades later')
    expect(result.timelineEvent.era).toBe('some decades later')
  })

  it('rejects an age decrease without explicit confirmation, leaving nothing changed', async () => {
    const seed = await seedTestChronicle()
    const cid = seed.chronicle.id
    await expect(
      performTimeJump(cid, { newEra: 'late 17th century', newAge: 100, newLocation: 'Sample town: Dunmere' }),
    ).rejects.toThrow(/lower than the current age|younger|correction/i)
    const chronicle = await db.chronicles.get(cid)
    expect(chronicle?.currentAge).toBe(214)
    expect(chronicle?.currentEra).toBe('early 16th century')
    expect(await db.timelineEvents.where('chronicleId').equals(cid).filter((e) => e.type === 'timeJump').count()).toBe(0)
  })

  it('allows an age decrease when the correction is confirmed', async () => {
    const seed = await seedTestChronicle()
    const result = await performTimeJump(seed.chronicle.id, {
      newEra: 'late 17th century',
      newAge: 100,
      newLocation: 'Sample town: Dunmere',
      allowAgeDecrease: true,
    })
    expect(result.chronicle.currentAge).toBe(100)
    expect(result.stateChange.newValue).toContain('100')
  })

  it('validates its input', async () => {
    const seed = await seedTestChronicle()
    const cid = seed.chronicle.id
    await expect(performTimeJump('no-such-chronicle', { newEra: 'x', newAge: 1, newLocation: 'y' })).rejects.toThrow(
      /Chronicle not found/,
    )
    await expect(
      performTimeJump(cid, { newEra: '   ', newAge: 300, newLocation: 'Sample town: Dunmere' }),
    ).rejects.toThrow(/new era is required/i)
    await expect(
      performTimeJump(cid, { newEra: 'late 17th century', newAge: 300, newLocation: '  ' }),
    ).rejects.toThrow(/new location is required/i)
    await expect(
      performTimeJump(cid, { newEra: 'late 17th century', newAge: -5, newLocation: 'Sample town: Dunmere' }),
    ).rejects.toThrow(/whole number/)
    await expect(
      performTimeJump(cid, { newEra: 'late 17th century', newAge: 300.5, newLocation: 'Sample town: Dunmere' }),
    ).rejects.toThrow(/whole number/)
  })

  it('invokes the injected snapshot creator with the NEW era/age/location when takeSnapshot is true', async () => {
    const seed = await seedTestChronicle()
    const createSnapshot = vi.fn(async () => ({ snapshotId: 'snap-1' }))
    const result = await performTimeJump(seed.chronicle.id, {
      newEra: 'late 17th century',
      newAge: 350,
      newLocation: 'Sample town: the northern port',
      takeSnapshot: true,
      createSnapshot,
    })
    expect(createSnapshot).toHaveBeenCalledTimes(1)
    expect(createSnapshot).toHaveBeenCalledWith(seed.chronicle.id, {
      era: 'late 17th century',
      age: 350,
      location: 'Sample town: the northern port',
      sourceId: result.timelineEvent.id,
      sourceKind: 'timeJump',
    })
    expect(result.snapshot).toEqual({ snapshotId: 'snap-1' })
  })

  it('does not call the snapshot creator when takeSnapshot is false or no creator is supplied', async () => {
    const seed = await seedTestChronicle()
    const createSnapshot = vi.fn(async () => ({}))
    const noSnapshot = await performTimeJump(seed.chronicle.id, {
      newEra: 'late 17th century',
      newAge: 350,
      newLocation: 'Sample town: Dunmere',
      takeSnapshot: false,
      createSnapshot,
    })
    expect(createSnapshot).not.toHaveBeenCalled()
    expect(noSnapshot.snapshot).toBeUndefined()

    const noCreator = await performTimeJump(seed.chronicle.id, {
      newEra: 'early 18th century',
      newAge: 400,
      newLocation: 'Sample town: Dunmere',
      takeSnapshot: true,
    })
    expect(noCreator.snapshot).toBeUndefined()
    expect((await db.chronicles.get(seed.chronicle.id))?.currentAge).toBe(400)
  })
})
