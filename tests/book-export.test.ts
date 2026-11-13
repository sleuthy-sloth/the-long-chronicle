// @vitest-environment node
// Stream D tests: single-file "Book" HTML export (Feature 5).
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '../src/db/database'
import { collectChronicleData, getDb } from '../src/lib/export'
import { escapeHtml, generateBookHtml } from '../src/lib/bookExport'
import { seedTestChronicle } from './seed-chronicle'
import { newId, nowIso } from '../src/db/types'

beforeEach(async () => {
  await resetDb()
})

async function seededHtml() {
  const seed = await seedTestChronicle()
  const data = await collectChronicleData(getDb(), seed.chronicle.id)
  return { seed, html: generateBookHtml(data) }
}

describe('generateBookHtml', () => {
  it('contains every section in reading order', async () => {
    const { html } = await seededHtml()
    const order = [
      'Overview',
      'Character Sheet',
      'Memories',
      'Journal',
      'Timeline',
      'People',
      'Places',
      'Story Threads',
      'Recaps',
    ]
    let last = -1
    for (const title of order) {
      const idx = html.indexOf(`<h2>${title}</h2>`)
      expect(idx).toBeGreaterThan(-1)
      expect(idx).toBeGreaterThan(last)
      last = idx
    }
  })

  it('carries the chronicle content and stable ids as labels', async () => {
    const { seed, html } = await seededHtml()
    expect(html).toContain('The Ashen Archive')
    expect(html).toContain('Mireille')
    expect(html).toContain(seed.chronicle.id)
    expect(html).toContain('Rain on stone')
    expect(html).toContain('M-001')
    expect(html).toContain(seed.memoryActiveId)
    expect(html).toContain('The lost letter')
    expect(html).toContain(seed.memoryLostId)
    expect(html).toContain('Entry 1 — First night in Dunmere')
    expect(html).toContain('Entry 2 — A quiet winter')
    expect(html).toContain(seed.entryOneId)
    expect(html).toContain('Anselm the miller')
    expect(html).toContain(seed.personId)
    expect(html).toContain('The mill at the river bend')
    expect(html).toContain(seed.placeId)
    expect(html).toContain('The debt owed to the miller')
    expect(html).toContain(seed.threadId)
    expect(html).toContain('Arrival in Dunmere')
    expect(html).toContain('Recap: the Dunmere years')
    expect(html).toContain('Lockpicking')
    expect(html).toContain('Novice → Experienced')
    // Earlier memory versions are kept in the book too.
    expect(html).toContain('forget the debt')
  })

  it('groups memories by status, in Active / Lost / Altered / Archived order', async () => {
    const { html } = await seededHtml()
    const order = ['<h3>Active</h3>', '<h3>Lost</h3>', '<h3>Altered</h3>', '<h3>Archived</h3>']
    let last = -1
    for (const heading of order) {
      const idx = html.indexOf(heading)
      expect(idx).toBeGreaterThan(-1)
      expect(idx).toBeGreaterThan(last)
      last = idx
    }
    expect(html.indexOf('Rain on stone')).toBeGreaterThan(html.indexOf('<h3>Active</h3>'))
    expect(html.indexOf('Rain on stone')).toBeLessThan(html.indexOf('<h3>Lost</h3>'))
    expect(html.indexOf('The lost letter')).toBeGreaterThan(html.indexOf('<h3>Lost</h3>'))
    expect(html.indexOf('The lost letter')).toBeLessThan(html.indexOf('<h3>Altered</h3>'))
  })

  it('has no external references: no URLs, no links, no scripts', async () => {
    const { html } = await seededHtml()
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    expect(html).not.toContain('//')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('src=')
    expect(html).not.toContain('href=')
    // Styling is inline only, in a single <style> block.
    expect(html).toContain('<style>')
    expect(html).toContain('background: #f4eedd')
    expect(html).toContain('color: #2b241f')
  })

  it('escapes user content — a script in a title stays text, never markup', async () => {
    const seed = await seedTestChronicle()
    const now = nowIso()
    await db.memories.put({
      id: newId(), chronicleId: seed.chronicle.id, createdAt: now, updatedAt: now,
      code: 'M-099', title: '<script>alert("stolen")</script>', text: 'Body with <b>tags</b> & "quotes".',
      status: 'Active', tags: [], personIds: [], placeIds: [], journalEntryIds: [],
    })
    const data = await collectChronicleData(getDb(), seed.chronicle.id)
    const html = generateBookHtml(data)
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<b>tags</b>')
    expect(html).toContain('&lt;script&gt;alert(&quot;stolen&quot;)&lt;/script&gt;')
    expect(html).toContain('Body with &lt;b&gt;tags&lt;/b&gt; &amp; &quot;quotes&quot;.')
  })

  it('escapeHtml escapes the five HTML-special characters', () => {
    expect(escapeHtml('<a href="x">&\'y\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;y&#39;&lt;/a&gt;')
    expect(escapeHtml('plain text')).toBe('plain text')
  })
})
