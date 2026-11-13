// @vitest-environment node
// Stream D tests: quiet writing stats (Feature 7).
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../src/db/database'
import { collectChronicleData, getDb } from '../src/lib/export'
import { computeWritingStats, countWords } from '../src/lib/stats'
import { seedTestChronicle } from './seed-chronicle'

beforeEach(async () => {
  await resetDb()
})

describe('countWords', () => {
  it('counts plain prose', () => {
    expect(countWords('One two three four.')).toBe(4)
    expect(countWords('  spaced   out   words  ')).toBe(3)
  })

  it('returns 0 for empty or whitespace-only bodies', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\n  ')).toBe(0)
  })

  it('strips headings, emphasis, and strikethrough', () => {
    expect(countWords('# A heading\n\nSome **bold** and *italic* text.')).toBe(7)
    expect(countWords('one ~~two~~ three')).toBe(3)
  })

  it('keeps link and image text, drops the URL', () => {
    expect(countWords('Read [the letter](https://example.com) today.')).toBe(4)
    expect(countWords('![a sketch of the mill](mill.png) here')).toBe(6)
  })

  it('strips code blocks entirely and inline code markers only', () => {
    expect(countWords('```\nsecret words here\n```\nvisible')).toBe(1)
    expect(countWords('run `the old bell` once')).toBe(5)
  })

  it('strips list markers and blockquote markers', () => {
    expect(countWords('- one\n- two three')).toBe(3)
    expect(countWords('1. first\n2. second item')).toBe(3)
    expect(countWords('> quoted words here')).toBe(3)
  })
})

describe('computeWritingStats', () => {
  it('counts words, entries, and memories from seeded data', async () => {
    const seed = await seedTestChronicle()
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    const stats = computeWritingStats(data)
    // Entry 1 body is 20 words, entry 2 body is 11 words.
    expect(stats.totalWords).toBe(31)
    expect(stats.entriesCount).toBe(2)
    expect(stats.memoriesKept).toBe(1)
    expect(stats.memoriesLost).toBe(1)
    expect(stats.memoriesAltered).toBe(1)
    expect(stats.peopleCount).toBe(1)
    expect(stats.placesCount).toBe(1)
    expect(stats.threadsCount).toBe(1)
  })

  it('counts entries per era and names the first and last era', async () => {
    const seed = await seedTestChronicle()
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    const stats = computeWritingStats(data)
    expect(stats.entriesPerEra).toEqual({
      'late 14th century': 1,
      'early 15th century': 1,
    })
    expect(stats.earliestEra).toBe('late 14th century')
    expect(stats.latestEra).toBe('early 15th century')
  })

  it('returns zeros and null eras for an empty chronicle', async () => {
    const seed = await seedTestChronicle()
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    const stats = computeWritingStats({ ...data, journal: [], memories: [], people: [], places: [], threads: [] })
    expect(stats.totalWords).toBe(0)
    expect(stats.entriesCount).toBe(0)
    expect(stats.entriesPerEra).toEqual({})
    expect(stats.memoriesKept).toBe(0)
    expect(stats.memoriesLost).toBe(0)
    expect(stats.memoriesAltered).toBe(0)
    expect(stats.earliestEra).toBeNull()
    expect(stats.latestEra).toBeNull()
  })
})
