// @vitest-environment node
// Stream D tests: global search (Stream A's src/lib/search.ts) — verifying
// the search Stream D's spec depends on, without duplicating its code.
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../src/db/database'
import { searchAll } from '../src/lib/search'
import { seedTestChronicle } from './seed-chronicle'

beforeEach(async () => {
  await resetDb()
})

describe('global search (Stream A searchAll)', () => {
  it('finds a journal entry and a memory by a shared word, with excerpts', async () => {
    await seedTestChronicle()
    const results = await searchAll('rain')
    const kinds = results.map((r) => r.kind)
    expect(kinds).toContain('Memory')
    expect(kinds).toContain('Journal entry')
    const memory = results.find((r) => r.kind === 'Memory')!
    expect(memory.title).toContain('Rain on stone')
    expect(memory.snippet.toLowerCase()).toContain('rain')
    const entry = results.find((r) => r.kind === 'Journal entry')!
    expect(entry.title).toContain('First night in Dunmere')
    expect(entry.snippet.toLowerCase()).toContain('rain')
  })

  it('finds people, places and threads by name', async () => {
    await seedTestChronicle()
    const results = await searchAll('miller')
    expect(results.map((r) => r.kind)).toContain('Person')
    expect(results.map((r) => r.kind)).toContain('Thread')
    expect(results.find((r) => r.kind === 'Person')?.title).toBe('Anselm the miller')
    const places = await searchAll('river bend')
    expect(places.map((r) => r.kind)).toContain('Place')
  })

  it('finds recaps and returns routes for navigation', async () => {
    await seedTestChronicle()
    const results = await searchAll('Dunmere years')
    expect(results.map((r) => r.kind)).toContain('Recap')
    for (const r of results) expect(r.route).toMatch(/^\//)
  })

  it('returns nothing for a one-character query or no match', async () => {
    await seedTestChronicle()
    expect(await searchAll('a')).toEqual([])
    expect(await searchAll('   ')).toEqual([])
    expect(await searchAll('zzqq-no-such-word')).toEqual([])
  })

  it('scopes to one chronicle when an id is given', async () => {
    const first = await seedTestChronicle()
    const second = await seedTestChronicle()
    const scoped = await searchAll('rain', second.chronicle.id)
    expect(scoped.length).toBeGreaterThan(0)
    // Nothing in the results may belong to the first chronicle's records:
    // every returned journal/memory id must resolve inside the second one.
    const other = await searchAll('rain', first.chronicle.id)
    expect(other.length).toBeGreaterThan(0)
    const scopedIds = new Set(scoped.map((r) => r.id))
    const otherIds = new Set(other.map((r) => r.id))
    for (const id of scopedIds) expect(otherIds.has(id)).toBe(false)
  })
})
