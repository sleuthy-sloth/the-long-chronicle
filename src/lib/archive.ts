// Recaps, endings, and the completed-chronicle archive (Stream C).
//
// Recaps are APPEND-ONLY: writing a new recap never touches an earlier
// one. A recap's body is one stored field with labelled sections — the
// form collects the sections separately and composes them, and
// parseRecapBody reads them back — so the stored shape stays the simple
// Recap type from src/db/types.ts while the page can show each section
// under its own heading.
//
// An ending never locks anything: completing a chronicle only flips its
// status to Completed (Stream A's archiveChronicle). Every record stays
// reviewable and editable afterwards.

import { db } from './localDb'
import { validateEntity } from '../db/validation'
import { newId, nowIso } from '../db/types'
import type { Chronicle, Ending, Recap } from '../db/types'

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

// ---------------------------------------------------------------------------
// Recaps
// ---------------------------------------------------------------------------

/** The labelled sections a recap is composed from, in display order. */
export const RECAP_SECTIONS = [
  { key: 'storySoFar', label: 'The story so far' },
  { key: 'believesNow', label: 'What the vampire believes now' },
  { key: 'hasBecome', label: 'What the vampire has become' },
  { key: 'peoplePlacesMemories', label: 'Important people, places, and memories' },
  { key: 'unresolvedQuestions', label: 'Unresolved questions' },
  { key: 'turningPoints', label: 'Major turning points' },
] as const

export type RecapSectionKey = (typeof RECAP_SECTIONS)[number]['key']
export type RecapSections = Partial<Record<RecapSectionKey, string>>

/**
 * Compose the stored body: each non-empty section under a `## Label`
 * heading, in RECAP_SECTIONS order. Free text outside any heading is
 * kept verbatim by parseRecapBody under the `preamble` key.
 */
export function composeRecapBody(sections: RecapSections): string {
  const parts: string[] = []
  for (const { key, label } of RECAP_SECTIONS) {
    const text = sections[key]?.trim()
    if (text) parts.push(`## ${label}\n\n${text}`)
  }
  return parts.join('\n\n')
}

/** Split a stored recap body back into its labelled sections. */
export function parseRecapBody(body: string): RecapSections & { preamble?: string } {
  const result: RecapSections & { preamble?: string } = {}
  const labelByHeading = new Map<string, RecapSectionKey>(RECAP_SECTIONS.map((s) => [s.label, s.key]))
  const lines = body.split('\n')
  let currentKey: RecapSectionKey | 'preamble' | null = null
  let currentText: string[] = []
  const flush = () => {
    const text = currentText.join('\n').trim()
    if (currentKey && text) {
      if (currentKey === 'preamble') result.preamble = text
      else result[currentKey] = text
    }
    currentText = []
  }
  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading && labelByHeading.has(heading[1])) {
      flush()
      currentKey = labelByHeading.get(heading[1])!
      continue
    }
    if (currentKey === null) currentKey = 'preamble'
    currentText.push(line)
  }
  flush()
  return result
}

export async function listRecaps(chronicleId: string): Promise<Recap[]> {
  const rows = await db.recaps.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Append a recap. Previous recaps are never modified by this call. */
export async function createRecap(
  chronicleId: string,
  input: { title: string; era: string; sections: RecapSections },
): Promise<Recap> {
  const now = nowIso()
  const recap = validateEntity('recaps', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    title: input.title.trim(),
    era: input.era.trim(),
    body: composeRecapBody(input.sections),
  })
  await db.recaps.put(recap)
  return recap
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

export async function listEndings(chronicleId: string): Promise<Ending[]> {
  const rows = await db.endings.where('chronicleId').equals(chronicleId).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getEnding(id: string): Promise<Ending | undefined> {
  return db.endings.get(id)
}

export interface NewEndingInput {
  finalEra: string
  finalAge?: number | null
  finalLocation?: string
  endingType?: string
  whatLost?: string
  whatEndured?: string
  finalScene?: string
  epilogue?: string
}

export async function createEnding(chronicleId: string, input: NewEndingInput): Promise<Ending> {
  const now = nowIso()
  const ending = validateEntity('endings', {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    finalEra: input.finalEra.trim(),
    finalAge: input.finalAge ?? undefined,
    finalLocation: clean(input.finalLocation),
    endingType: clean(input.endingType),
    whatLost: clean(input.whatLost),
    whatEndured: clean(input.whatEndured),
    finalScene: clean(input.finalScene),
    epilogue: clean(input.epilogue),
  })
  await db.endings.put(ending)
  return ending
}

export async function updateEnding(id: string, patch: Partial<Ending>): Promise<Ending> {
  const existing = await db.endings.get(id)
  if (!existing) throw new Error(`Ending not found: ${id}`)
  const next = validateEntity('endings', { ...existing, ...patch, id: existing.id, updatedAt: nowIso() })
  await db.endings.put(next)
  return next
}

export async function deleteEnding(id: string): Promise<void> {
  await db.endings.delete(id)
}

// ---------------------------------------------------------------------------
// Completed chronicles with their ending records
// ---------------------------------------------------------------------------

export interface ArchivedChronicle {
  chronicle: Chronicle
  endings: Ending[]
  recapCount: number
}

/** Every Completed chronicle, each with its ending record(s) and recap count. */
export async function listArchivedChronicles(): Promise<ArchivedChronicle[]> {
  const completed = await db.chronicles.where('status').equals('Completed').toArray()
  completed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return Promise.all(
    completed.map(async (chronicle) => ({
      chronicle,
      endings: await listEndings(chronicle.id),
      recapCount: await db.recaps.where('chronicleId').equals(chronicle.id).count(),
    })),
  )
}
