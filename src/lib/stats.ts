// Stream D — Quiet writing stats (Feature 7).
//
// Counts only — computed from data that already exists, never stored, and
// never judged. No streaks, no goals, no comparisons, no "you should write
// more": just the record, stated plainly. Word counts strip Markdown
// markup roughly (headings, links, emphasis, code, lists) and then count
// whitespace-separated words; an empty body is 0 words.
import { collectChronicleData, getDb, type ChronicleData, type ChronicleDbLike } from './export'
import type { ID } from '../db/types'

export interface WritingStats {
  /** Words across journal entries (body, choices, consequences, long term). */
  totalWords: number
  entriesCount: number
  /** Journal entries per era, in first-appearance order. */
  entriesPerEra: Record<string, number>
  /** Memories still held as written (Active) or filed away (Archived). */
  memoriesKept: number
  memoriesLost: number
  memoriesAltered: number
  peopleCount: number
  placesCount: number
  threadsCount: number
  /** Era of the lowest-numbered journal entry, or null when there are none. */
  earliestEra: string | null
  /** Era of the highest-numbered journal entry, or null when there are none. */
  latestEra: string | null
}

/**
 * Strip Markdown markup roughly, then count whitespace-separated words.
 * Headings, links (kept as their text), emphasis, code spans and blocks,
 * list markers, blockquotes, rules, and HTML tags are removed; the words
 * themselves are left alone. Empty or markup-only input is 0.
 */
export function countWords(text: string): number {
  if (!text) return 0
  let stripped = text
    // Fenced code blocks first, so their contents never count.
    .replace(/```[\s\S]*?```/g, ' ')
    // Images keep their alt text; links keep their text.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Inline code keeps its contents as plain words.
    .replace(/`([^`]*)`/g, '$1')
    // HTML tags.
    .replace(/<[^>]*>/g, ' ')
    // Heading markers, blockquote markers, list markers, rules.
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/^([-*_]){3,}\s*$/gm, ' ')
    // Emphasis, bold, strikethrough markers.
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
  const words = stripped.split(/\s+/).filter((w) => w.length > 0)
  return words.length
}

function entryWords(entry: { body: string; choices?: string; consequences?: string; longTerm?: string }): number {
  return (
    countWords(entry.body) +
    countWords(entry.choices ?? '') +
    countWords(entry.consequences ?? '') +
    countWords(entry.longTerm ?? '')
  )
}

/** Compute the quiet record for one chronicle from its collected data. */
export function computeWritingStats(data: ChronicleData): WritingStats {
  const entriesPerEra: Record<string, number> = {}
  for (const entry of data.journal) {
    entriesPerEra[entry.era] = (entriesPerEra[entry.era] ?? 0) + 1
  }
  const sorted = [...data.journal].sort((a, b) => a.number - b.number)
  return {
    totalWords: data.journal.reduce((sum, entry) => sum + entryWords(entry), 0),
    entriesCount: data.journal.length,
    entriesPerEra,
    memoriesKept: data.memories.filter((m) => m.status === 'Active' || m.status === 'Archived').length,
    memoriesLost: data.memories.filter((m) => m.status === 'Lost').length,
    memoriesAltered: data.memories.filter((m) => m.status === 'Altered').length,
    peopleCount: data.people.length,
    placesCount: data.places.length,
    threadsCount: data.threads.length,
    earliestEra: sorted[0]?.era ?? null,
    latestEra: sorted[sorted.length - 1]?.era ?? null,
  }
}

/** Convenience: load a chronicle and compute its stats in one call. */
export async function computeWritingStatsForChronicle(
  db: ChronicleDbLike,
  chronicleId: ID,
): Promise<WritingStats> {
  const data = await collectChronicleData(db, chronicleId)
  return computeWritingStats(data)
}

/** Convenience over the shared database. */
export async function computeWritingStatsForActiveChronicle(chronicleId: ID): Promise<WritingStats> {
  return computeWritingStatsForChronicle(getDb(), chronicleId)
}
