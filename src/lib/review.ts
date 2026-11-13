// Memory Review Mode (Stream B, Feature 3).
//
// A quiet way to revisit the archive: the queue puts memories that have
// never been revisited first, then the ones revisited longest ago. There is
// no score, no streak, no progress bar — only the count of what has been
// revisited and what has not, and the memories themselves.
//
// "Active" is the only status that joins the queue. Lost, Altered and
// Archived memories are still on record, but review mode is for the
// memories the vampire still holds clearly.
import { db } from './localDb'
import type { Memory } from '../db/types'
import { nowIso } from '../db/types'

export interface ReviewCounts {
  /** Active memories with a lastReviewedAt stamp. */
  reviewed: number
  /** Active memories never revisited (lastReviewedAt null/undefined). */
  neverReviewed: number
  /** All active memories. */
  totalActive: number
}

function isNeverReviewed(m: Memory): boolean {
  return m.lastReviewedAt === null || m.lastReviewedAt === undefined
}

/**
 * The review queue for a chronicle: active memories, least recently
 * revisited first. Never-revisited memories come first (oldest recorded
 * first among them, by code), then revisited ones oldest stamp first.
 */
export async function listReviewQueue(chronicleId: string): Promise<Memory[]> {
  const all = await db.memories.where('chronicleId').equals(chronicleId).toArray()
  const active = all.filter((m) => m.status === 'Active')
  const never = active.filter(isNeverReviewed).sort((a, b) => a.code.localeCompare(b.code))
  const reviewed = active
    .filter((m) => !isNeverReviewed(m))
    .sort((a, b) => (a.lastReviewedAt as string).localeCompare(b.lastReviewedAt as string))
  return [...never, ...reviewed]
}

/**
 * Stamp a memory as revisited now. Returns the updated memory.
 * Throws if the memory does not exist.
 */
export async function markReviewed(memoryId: string): Promise<Memory> {
  const memory = await db.memories.get(memoryId)
  if (!memory) throw new Error(`Memory not found: ${memoryId}`)
  const now = nowIso()
  const updated: Memory = { ...memory, lastReviewedAt: now, updatedAt: now }
  await db.memories.put(updated)
  return updated
}

/** How many active memories have been revisited, and how many have not. */
export async function reviewCounts(chronicleId: string): Promise<ReviewCounts> {
  const all = await db.memories.where('chronicleId').equals(chronicleId).toArray()
  const active = all.filter((m) => m.status === 'Active')
  const neverReviewed = active.filter(isNeverReviewed).length
  return {
    reviewed: active.length - neverReviewed,
    neverReviewed,
    totalActive: active.length,
  }
}
