// @vitest-environment node
// Stream D tests: Markdown export files + combined single-file export.
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../src/db/database'
import { collectChronicleData, getDb } from '../src/lib/export'
import { buildCombinedMarkdown, buildMarkdownFiles } from '../src/lib/markdownExport'
import { seedTestChronicle } from './seed-chronicle'

beforeEach(async () => {
  await resetDb()
})

describe('Markdown export', () => {
  it('produces one file per section plus one per journal entry', async () => {
    const seed = await seedTestChronicle()
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    const files = buildMarkdownFiles(data)
    const names = Object.keys(files)
    for (const expected of [
      'Chronicle Overview.md',
      'Character Sheet.md',
      'Memories.md',
      'Journal/001-first-night-in-dunmere.md',
      'Journal/002-a-quiet-winter.md',
      'Timeline.md',
      'People.md',
      'Places.md',
      'Story Threads.md',
      'Recaps.md',
    ]) {
      expect(names).toContain(expected)
    }
    expect(names).toHaveLength(10)
  })

  it('carries stable ids and cross-references in text', async () => {
    const seed = await seedTestChronicle()
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    const files = buildMarkdownFiles(data)
    expect(files['Chronicle Overview.md']).toContain(seed.chronicle.id)
    expect(files['Chronicle Overview.md']).toContain('3 memories (1 lost, 1 altered)')
    expect(files['Memories.md']).toContain('Sample memory: the smell of rain on stone')
    expect(files['Memories.md']).toContain('forget the debt') // earlier version kept
    expect(files['Memories.md']).toContain(`Person: Anselm the miller (${seed.personId})`)
    expect(files['Journal/001-first-night-in-dunmere.md']).toContain(`Memory: M-001 — Rain on stone (${seed.memoryActiveId})`)
    expect(files['Journal/001-first-night-in-dunmere.md']).toContain(`Thread: The debt owed to the miller (${seed.threadId})`)
    expect(files['Character Sheet.md']).toContain('Lockpicking')
    expect(files['Character Sheet.md']).toContain('Novice → Experienced')
    expect(files['Timeline.md']).toContain('around 1410')
    expect(files['People.md']).toContain('Anselm the miller')
    expect(files['Places.md']).toContain('The mill at the river bend')
    expect(files['Story Threads.md']).toContain('The debt owed to the miller')
    expect(files['Recaps.md']).toContain('Recap: the Dunmere years')
  })

  it('combined file contains every section in reading order', async () => {
    const seed = await seedTestChronicle()
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    const combined = buildCombinedMarkdown(data)
    const order = [
      '# The Ashen Archive',
      '# Character Sheet — Mireille',
      '# Memories',
      '# Entry 1 — First night in Dunmere',
      '# Entry 2 — A quiet winter',
      '# Timeline',
      '# People',
      '# Places',
      '# Story Threads',
      '# Recaps',
    ]
    let lastIndex = -1
    for (const heading of order) {
      const index = combined.indexOf(heading)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })
})
