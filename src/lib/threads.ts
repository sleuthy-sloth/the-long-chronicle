// Story threads data access (Stream C).
//
// A thread is an open question or unfinished business carried across
// centuries: title, description, era introduced, status, links to the
// people/places/memories/entries involved, and resolution notes when it
// closes. Status changes are plain updates — a resolved thread can always
// be reopened; nothing here locks.
import { db } from './localDb'
import { validateEntity } from '../db/validation'
import { newId, nowIso } from '../db/types'
import type { StoryThread, ThreadStatus } from '../db/types'

export const THREAD_STATUSES: ThreadStatus[] = ['Open', 'Dormant', 'Resolved', 'Abandoned']

/** Allowed transitions. Everything can return to Open — no dead ends. */
export const THREAD_TRANSITIONS: Record<ThreadStatus, ThreadStatus[]> = {
  Open: ['Dormant', 'Resolved', 'Abandoned'],
  Dormant: ['Open', 'Resolved', 'Abandoned'],
  Resolved: ['Open', 'Dormant'],
  Abandoned: ['Open', 'Dormant'],
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export async function listThreads(chronicleId: string): Promise<StoryThread[]> {
  const rows = await db.storyThreads.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => a.title.localeCompare(b.title))
}

export async function getThread(id: string): Promise<StoryThread | undefined> {
  return db.storyThreads.get(id)
}

export interface NewThreadInput {
  title: string
  description?: string
  introducedEra?: string
  personIds?: string[]
  placeIds?: string[]
  memoryIds?: string[]
  journalEntryIds?: string[]
}

export async function createThread(chronicleId: string, input: NewThreadInput): Promise<StoryThread> {
  const now = nowIso()
  const thread = validateEntity('storyThreads', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    title: input.title.trim(),
    description: clean(input.description),
    introducedEra: clean(input.introducedEra),
    status: 'Open' as ThreadStatus,
    personIds: input.personIds ?? [],
    placeIds: input.placeIds ?? [],
    memoryIds: input.memoryIds ?? [],
    journalEntryIds: input.journalEntryIds ?? [],
    resolutionNotes: undefined,
  })
  await db.storyThreads.put(thread)
  return thread
}

export async function updateThread(id: string, patch: Partial<StoryThread>): Promise<StoryThread> {
  const existing = await db.storyThreads.get(id)
  if (!existing) throw new Error(`Story thread not found: ${id}`)
  const next = validateEntity('storyThreads', { ...existing, ...patch, id: existing.id, updatedAt: nowIso() })
  await db.storyThreads.put(next)
  return next
}

/**
 * Move a thread to a new status. Throws on a transition outside
 * THREAD_TRANSITIONS, so the UI cannot put a thread somewhere
 * meaningless — but every status can return to Open, so a thread is
 * never stuck. Clearing the status notes when reopening is the caller's
 * choice; this keeps any resolution notes as history.
 */
export async function setThreadStatus(
  id: string,
  status: ThreadStatus,
  resolutionNotes?: string,
): Promise<StoryThread> {
  const existing = await db.storyThreads.get(id)
  if (!existing) throw new Error(`Story thread not found: ${id}`)
  if (!THREAD_TRANSITIONS[existing.status].includes(status)) {
    throw new Error(`Cannot move a ${existing.status} thread to ${status}`)
  }
  return updateThread(id, {
    status,
    resolutionNotes:
      resolutionNotes !== undefined ? clean(resolutionNotes) : existing.resolutionNotes,
  })
}

export async function deleteThread(id: string): Promise<void> {
  await db.storyThreads.delete(id)
}
