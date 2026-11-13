// @vitest-environment node
// Feature 3 tests: Memory Review Mode — queue ordering (never-reviewed
// first, then oldest-reviewed first), markReviewed stamping + reordering,
// and counts. All test content is invented placeholder text written for
// these tests.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '../src/db/database'
import { seedTestChronicle } from './seed-chronicle'
import { newId, nowIso } from '../src/db/types'
import { listReviewQueue, markReviewed, reviewCounts } from '../src/lib/review'

beforeEach(async () => {
  await resetDb()
})

async function addMemory(
  chronicleId: string,
  code: string,
  title: string,
  status: 'Active' | 'Lost' | 'Altered' | 'Archived',
  lastReviewedAt?: string | null,
) {
  const now = nowIso()
  const id = newId()
  await db.memories.put({
    id,
    chronicleId,
    createdAt: now,
    updatedAt: now,
    code,
    title,
    text: `Sample memory: ${title}.`,
    status,
    tags: [],
    personIds: [],
    placeIds: [],
    journalEntryIds: [],
    lastReviewedAt: lastReviewedAt ?? null,
  })
  return id
}

describe('listReviewQueue', () => {
  it('puts never-reviewed memories first, then oldest-reviewed first', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    // Seed already has M-001 (Active, never reviewed) and M-002 (Lost) + M-003 (Altered).
    await addMemory(chronicleId, 'M-004', 'Sample memory: a second unreviewed one', 'Active', null)
    await addMemory(chronicleId, 'M-005', 'Sample memory: reviewed long ago', 'Active', '2020-01-01T00:00:00.000Z')
    await addMemory(chronicleId, 'M-006', 'Sample memory: reviewed more recently', 'Active', '2026-01-01T00:00:00.000Z')
    await addMemory(chronicleId, 'M-007', 'Sample memory: lost and reviewed', 'Lost', '2019-01-01T00:00:00.000Z')

    const queue = await listReviewQueue(chronicleId)
    expect(queue.map((m) => m.code)).toEqual(['M-001', 'M-004', 'M-005', 'M-006'])
  })

  it('excludes non-active memories entirely', async () => {
    const seed = await seedTestChronicle()
    const queue = await listReviewQueue(seed.chronicle.id)
    expect(queue.map((m) => m.code)).toEqual(['M-001'])
    expect(queue.every((m) => m.status === 'Active')).toBe(true)
  })

  it('returns an empty queue for a chronicle with no active memories', async () => {
    const seed = await seedTestChronicle()
    await db.memories.where('chronicleId').equals(seed.chronicle.id).delete()
    expect(await listReviewQueue(seed.chronicle.id)).toEqual([])
  })
})

describe('markReviewed', () => {
  it('stamps lastReviewedAt and moves the memory to the end of the queue', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    await addMemory(chronicleId, 'M-004', 'Sample memory: a second unreviewed one', 'Active', null)
    await addMemory(chronicleId, 'M-005', 'Sample memory: reviewed long ago', 'Active', '2020-01-01T00:00:00.000Z')

    const before = await listReviewQueue(chronicleId)
    expect(before.map((m) => m.code)).toEqual(['M-001', 'M-004', 'M-005'])

    const stamped = await markReviewed(seed.memoryActiveId)
    expect(stamped.lastReviewedAt).toBeTruthy()
    expect(new Date(stamped.lastReviewedAt as string).getTime()).toBeLessThanOrEqual(Date.now())

    const after = await listReviewQueue(chronicleId)
    expect(after.map((m) => m.code)).toEqual(['M-004', 'M-005', 'M-001'])
  })

  it('restamping moves the memory to the end again', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    const oldId = await addMemory(chronicleId, 'M-004', 'Sample memory: reviewed long ago', 'Active', '2020-01-01T00:00:00.000Z')
    const recentId = await addMemory(chronicleId, 'M-005', 'Sample memory: reviewed recently', 'Active', '2026-01-01T00:00:00.000Z')

    await markReviewed(oldId)
    const queue = await listReviewQueue(chronicleId)
    // M-001 (never reviewed) first, then the 2026 stamp, then the just-stamped one.
    expect(queue.map((m) => m.id)).toEqual([seed.memoryActiveId, recentId, oldId])
  })

  it('throws for an unknown memory', async () => {
    await expect(markReviewed('no-such-id')).rejects.toThrow(/Memory not found/)
  })
})

describe('reviewCounts', () => {
  it('counts reviewed, never-reviewed and total active memories', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    await addMemory(chronicleId, 'M-004', 'Sample memory: a second unreviewed one', 'Active', null)
    await addMemory(chronicleId, 'M-005', 'Sample memory: reviewed long ago', 'Active', '2020-01-01T00:00:00.000Z')
    await addMemory(chronicleId, 'M-006', 'Sample memory: lost, never reviewed', 'Lost', null)

    expect(await reviewCounts(chronicleId)).toEqual({ reviewed: 1, neverReviewed: 2, totalActive: 3 })
  })

  it('is all zeros for a chronicle with no active memories', async () => {
    const seed = await seedTestChronicle()
    await db.memories.where('chronicleId').equals(seed.chronicle.id).delete()
    expect(await reviewCounts(seed.chronicle.id)).toEqual({ reviewed: 0, neverReviewed: 0, totalActive: 0 })
  })
})
