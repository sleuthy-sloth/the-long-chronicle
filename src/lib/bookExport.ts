// Stream D — Single-file "Book" export (Feature 5).
//
// One self-contained HTML file for a whole chronicle: inline CSS only, in a
// single <style> block — no external assets, no external fonts, no external
// URLs of any kind, no scripts. It opens directly from disk (file://) and
// prints cleanly. Parchment styling follows the app's light theme tokens
// (src/config/app.ts). Section order mirrors the Markdown export:
// Overview, Character Sheet, Memories (grouped by status), Journal
// (chronological, one section per entry), Timeline, People, Places, Story
// Threads, Recaps. Every record carries its stable id as a small muted
// label so a printed page traces back to its database row. All user content
// is escaped — never injected raw.
import { THEME_TOKENS } from '../config/app'
import {
  collectChronicleData,
  downloadFile,
  exportFileName,
  getDb,
  type ChronicleData,
  type ChronicleDbLike,
} from './export'
import type { ID } from '../db/types'

/** Escape text for safe insertion into HTML — never inject raw user text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const T = THEME_TOKENS.light

const BOOK_CSS = [
  'body { font-family: Georgia, "Times New Roman", serif; background: ' + T.bg + '; color: ' + T.ink + '; margin: 0; padding: 2rem 1.5rem 4rem; line-height: 1.6; }',
  'main { max-width: 44rem; margin: 0 auto; }',
  'h1 { font-size: 2rem; margin: 0 0 0.25rem; color: ' + T.accent + '; }',
  'h2 { font-size: 1.5rem; margin: 2.5rem 0 0.75rem; padding-bottom: 0.25rem; border-bottom: 2px solid ' + T.gold + '; color: ' + T.accent + '; }',
  'h3 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; color: ' + T.ink + '; }',
  'h4 { font-size: 1.05rem; margin: 1.25rem 0 0.25rem; }',
  'p { margin: 0.5rem 0; }',
  'ul { margin: 0.5rem 0; padding-left: 1.25rem; }',
  'li { margin: 0.25rem 0; }',
  '.subtitle { font-style: italic; color: #5a5044; }',
  '.id { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.75rem; color: #7a6f5d; }',
  '.meta { font-size: 0.9rem; color: #5a5044; }',
  '.body { white-space: pre-wrap; }',
  '.card { background: ' + T.card + '; border: 1px solid #d8cdb4; border-radius: 0.5rem; padding: 1rem 1.25rem; margin: 0.75rem 0; }',
  '.empty { font-style: italic; color: #7a6f5d; }',
  '.cover { text-align: center; padding: 3rem 0 2rem; border-bottom: 3px double ' + T.gold + '; margin-bottom: 1rem; }',
  '.cover .rule { color: ' + T.gold + '; letter-spacing: 0.5rem; }',
  'footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #d8cdb4; font-size: 0.85rem; color: #7a6f5d; text-align: center; }',
  '@media print { body { background: #fff; padding: 0; } .card { break-inside: avoid; } h2, h3 { break-after: avoid; } }',
].join('\n')

function field(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</p>\n`
}

function idLabel(id: string): string {
  return `<span class="id">${escapeHtml(id)}</span>`
}

function refLine(label: string, title: string, id: string): string {
  return `<li>${escapeHtml(label)}: ${escapeHtml(title)} ${idLabel(id)}</li>\n`
}

function sectionHtml(title: string, body: string): string {
  return `<section>\n<h2>${escapeHtml(title)}</h2>\n${body}</section>\n`
}

function overviewHtml(data: ChronicleData): string {
  const c = data.chronicle
  const atAGlance = [
    `${data.memories.length} memories (${data.memories.filter((m) => m.status === 'Lost').length} lost, ${data.memories.filter((m) => m.status === 'Altered').length} altered)`,
    `${data.journal.length} journal entries`,
    `${data.people.length} people, ${data.places.length} places, ${data.threads.length} story threads`,
    `${data.timeline.length} timeline events, ${data.recaps.length} recaps`,
  ]
  let body = ''
  if (c.concept) body += `<p class="body">${escapeHtml(c.concept)}</p>\n`
  body += field('Vampire', c.vampireName)
  body += field('Pronouns', c.pronouns)
  body += field('Age', `${c.currentAge} (started at ${c.startingAge})`)
  body += field('Era', `${c.currentEra} (started in ${c.startingEra})`)
  body += field('Location', `${c.currentLocation} (started in ${c.startingLocation})`)
  body += field('Status', c.status)
  body += field('Tension', c.tension)
  body += field('Chronicle ID', c.id)
  if (data.ending) {
    body += field('Ending', `${data.ending.endingType ? `${data.ending.endingType} — ` : ''}${data.ending.finalEra}`)
  }
  body += `<h3>At a glance</h3>\n<ul>\n${atAGlance.map((line) => `<li>${escapeHtml(line)}</li>\n`).join('')}</ul>\n`
  return sectionHtml('Overview', body)
}

function characterSheetHtml(data: ChronicleData): string {
  const c = data.chronicle
  let body = `<p class="meta">Chronicle: ${escapeHtml(c.title)} ${idLabel(c.id)}</p>\n`
  body += '<h3>Skills</h3>\n'
  body += data.skills.length > 0
    ? `<ul>\n${data.skills.map((s) => `<li><strong>${escapeHtml(s.name)}</strong>${s.value ? ` — ${escapeHtml(s.value)}` : ''}${s.description ? `: ${escapeHtml(s.description)}` : ''}${s.notes ? ` (${escapeHtml(s.notes)})` : ''} ${idLabel(s.id)}</li>\n`).join('')}</ul>\n`
    : '<p class="empty">No skills recorded.</p>\n'
  body += '<h3>Resources</h3>\n'
  body += data.resources.length > 0
    ? `<ul>\n${data.resources.map((r) => `<li><strong>${escapeHtml(r.name)}</strong>${r.quantity ? ` — ${escapeHtml(r.quantity)}` : ''}${r.description ? `: ${escapeHtml(r.description)}` : ''}${r.notes ? ` (${escapeHtml(r.notes)})` : ''} ${idLabel(r.id)}</li>\n`).join('')}</ul>\n`
    : '<p class="empty">No resources recorded.</p>\n'
  body += '<h3>Change history</h3>\n'
  body += data.stateChanges.length > 0
    ? `<ul>\n${data.stateChanges.map((ch) => `<li>${escapeHtml(ch.field)}: ${escapeHtml(ch.oldValue ?? '—')} → ${escapeHtml(ch.newValue ?? '—')}${ch.note ? ` — ${escapeHtml(ch.note)}` : ''} ${idLabel(ch.id)}</li>\n`).join('')}</ul>\n`
    : '<p class="empty">No changes recorded.</p>\n'
  return sectionHtml('Character Sheet', body)
}

function memoriesHtml(data: ChronicleData): string {
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
  const people = byId(data.people)
  const places = byId(data.places)
  const groups: Array<[string, string]> = [
    ['Active', 'Active'],
    ['Lost', 'Lost'],
    ['Altered', 'Altered'],
    ['Archived', 'Archived'],
  ]
  let body = ''
  for (const [heading, status] of groups) {
    const group = data.memories.filter((m) => m.status === status)
    body += `<h3>${escapeHtml(heading)}</h3>\n`
    if (group.length === 0) {
      body += '<p class="empty">No memories here.</p>\n'
      continue
    }
    for (const m of group) {
      const versions = data.memoryVersions.filter((v) => v.memoryId === m.id)
      body += '<div class="card">\n'
      body += `<h4>${escapeHtml(m.code)} — ${escapeHtml(m.title)}</h4>\n`
      body += `<p class="meta">Status: ${escapeHtml(m.status)}${m.occurredEra ?? m.recordedEra ? ` · Era: ${escapeHtml(m.occurredEra ?? m.recordedEra ?? '')}` : ''}${m.tags.length > 0 ? ` · Tags: ${escapeHtml(m.tags.join(', '))}` : ''} · ${idLabel(m.id)}</p>\n`
      body += `<p class="body">${escapeHtml(m.text)}</p>\n`
      const refs: string[] = []
      for (const personId of m.personIds) {
        const p = people.get(personId)
        if (p) refs.push(refLine('Person', p.name, p.id))
      }
      for (const placeId of m.placeIds) {
        const p = places.get(placeId)
        if (p) refs.push(refLine('Place', p.name, p.id))
      }
      if (refs.length > 0) body += `<ul>\n${refs.join('')}</ul>\n`
      if (versions.length > 0) {
        body += '<p><strong>Earlier versions:</strong></p>\n<ul>\n'
        for (const v of versions) {
          body += `<li>v${v.version} (${escapeHtml(v.status)}${v.changedEra ? `, ${escapeHtml(v.changedEra)}` : ''}${v.note ? ` — ${escapeHtml(v.note)}` : ''}): ${escapeHtml(v.text)} ${idLabel(v.id)}</li>\n`
        }
        body += '</ul>\n'
      }
      body += '</div>\n'
    }
  }
  return sectionHtml('Memories', body)
}

function journalHtml(data: ChronicleData): string {
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
  const memories = byId(data.memories)
  const people = byId(data.people)
  const places = byId(data.places)
  const threads = byId(data.threads)
  if (data.journal.length === 0) return sectionHtml('Journal', '<p class="empty">No journal entries yet.</p>\n')
  let body = ''
  for (const entry of data.journal) {
    body += '<div class="card">\n'
    body += `<h3>Entry ${entry.number} — ${escapeHtml(entry.title)}</h3>\n`
    body += field('Era', entry.era)
    body += field('Age', entry.age)
    body += field('Location', entry.location)
    body += field('Prompt', entry.promptText)
    body += field('Prompt reference', entry.promptRef)
    body += `<p class="meta">Entry ID: ${idLabel(entry.id)}</p>\n`
    body += `<p class="body">${escapeHtml(entry.body)}</p>\n`
    if (entry.choices) body += `<h4>Choices</h4>\n<p class="body">${escapeHtml(entry.choices)}</p>\n`
    if (entry.consequences) body += `<h4>Consequences</h4>\n<p class="body">${escapeHtml(entry.consequences)}</p>\n`
    if (entry.longTerm) body += `<h4>Long term</h4>\n<p class="body">${escapeHtml(entry.longTerm)}</p>\n`
    const refs: string[] = []
    for (const id of entry.memoryIds) {
      const m = memories.get(id)
      if (m) refs.push(refLine('Memory', `${m.code} — ${m.title}`, m.id))
    }
    for (const id of entry.personIds) {
      const p = people.get(id)
      if (p) refs.push(refLine('Person', p.name, p.id))
    }
    for (const id of entry.placeIds) {
      const p = places.get(id)
      if (p) refs.push(refLine('Place', p.name, p.id))
    }
    for (const id of entry.threadIds) {
      const t = threads.get(id)
      if (t) refs.push(refLine('Thread', t.title, t.id))
    }
    if (refs.length > 0) body += `<h4>Linked records</h4>\n<ul>\n${refs.join('')}</ul>\n`
    body += '</div>\n'
  }
  return sectionHtml('Journal', body)
}

function timelineHtml(data: ChronicleData): string {
  if (data.timeline.length === 0) return sectionHtml('Timeline', '<p class="empty">No timeline events yet.</p>\n')
  const items = data.timeline
    .map((e) => `<li><strong>${escapeHtml(e.era)}</strong> — ${escapeHtml(e.title)}${e.description ? `: ${escapeHtml(e.description)}` : ''} <span class="meta">(${escapeHtml(e.type)})</span> ${idLabel(e.id)}</li>\n`)
    .join('')
  return sectionHtml('Timeline', `<ul>\n${items}</ul>\n`)
}

function peopleHtml(data: ChronicleData): string {
  if (data.people.length === 0) return sectionHtml('People', '<p class="empty">No people recorded yet.</p>\n')
  let body = ''
  for (const p of data.people) {
    body += '<div class="card">\n'
    body += `<h3>${escapeHtml(p.name)}</h3>\n`
    body += field('Status', p.status)
    body += field('Relationship', p.relationship)
    body += field('First appearance', p.firstAppearance)
    body += field('Last known era', p.lastKnownEra)
    body += field('Wants', p.wants)
    body += `<p class="meta">ID: ${idLabel(p.id)}</p>\n`
    if (p.description) body += `<p class="body">${escapeHtml(p.description)}</p>\n`
    if (p.notes) body += `<p class="body">${escapeHtml(p.notes)}</p>\n`
    body += '</div>\n'
  }
  return sectionHtml('People', body)
}

function placesHtml(data: ChronicleData): string {
  if (data.places.length === 0) return sectionHtml('Places', '<p class="empty">No places recorded yet.</p>\n')
  let body = ''
  for (const p of data.places) {
    body += '<div class="card">\n'
    body += `<h3>${escapeHtml(p.name)}</h3>\n`
    body += field('Region', p.region)
    body += field('First visit', p.firstVisit)
    body += field('Last visit', p.lastVisit)
    body += field('Significance', p.significance)
    body += `<p class="meta">ID: ${idLabel(p.id)}</p>\n`
    if (p.description) body += `<p class="body">${escapeHtml(p.description)}</p>\n`
    body += '</div>\n'
  }
  return sectionHtml('Places', body)
}

function threadsHtml(data: ChronicleData): string {
  if (data.threads.length === 0) return sectionHtml('Story Threads', '<p class="empty">No story threads yet.</p>\n')
  let body = ''
  for (const t of data.threads) {
    body += '<div class="card">\n'
    body += `<h3>${escapeHtml(t.title)}</h3>\n`
    body += field('Status', t.status)
    body += field('Introduced', t.introducedEra)
    body += `<p class="meta">ID: ${idLabel(t.id)}</p>\n`
    if (t.description) body += `<p class="body">${escapeHtml(t.description)}</p>\n`
    if (t.resolutionNotes) body += `<p><strong>Resolution:</strong> ${escapeHtml(t.resolutionNotes)}</p>\n`
    body += '</div>\n'
  }
  return sectionHtml('Story Threads', body)
}

function recapsHtml(data: ChronicleData): string {
  if (data.recaps.length === 0) return sectionHtml('Recaps', '<p class="empty">No recaps yet.</p>\n')
  let body = ''
  for (const r of data.recaps) {
    body += '<div class="card">\n'
    body += `<h3>${escapeHtml(r.title)}</h3>\n`
    body += field('Era', r.era)
    body += `<p class="meta">ID: ${idLabel(r.id)}</p>\n`
    body += `<p class="body">${escapeHtml(r.body)}</p>\n`
    body += '</div>\n'
  }
  return sectionHtml('Recaps', body)
}

/**
 * Build the whole chronicle as one self-contained HTML document. Inline CSS
 * only; no scripts, no external references of any kind — it reads correctly
 * opened straight from disk. Journal entries arrive already sorted by
 * number from collectChronicleData, so the Journal section is chronological.
 */
export function generateBookHtml(data: ChronicleData): string {
  const c = data.chronicle
  const exportedOn = new Date().toISOString().slice(0, 10)
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(c.title)} — The Long Chronicle</title>`,
    '<style>',
    BOOK_CSS,
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<div class="cover">',
    `<h1>${escapeHtml(c.title)}</h1>`,
    `<p class="subtitle">The chronicle of ${escapeHtml(c.vampireName)}</p>`,
    '<p class="rule" aria-hidden="true">❦</p>',
    `<p class="meta">Exported ${escapeHtml(exportedOn)} · Chronicle ID ${escapeHtml(c.id)}</p>`,
    '</div>',
    overviewHtml(data),
    characterSheetHtml(data),
    memoriesHtml(data),
    journalHtml(data),
    timelineHtml(data),
    peopleHtml(data),
    placesHtml(data),
    threadsHtml(data),
    recapsHtml(data),
    '<footer>',
    '<p>Exported from The Long Chronicle — a single self-contained file. No connection is needed to read it, and every record carries its id so a printed page traces back to the archive.</p>',
    '</footer>',
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/** Convenience: load a chronicle and build its book HTML in one call. */
export async function generateBookHtmlForChronicle(db: ChronicleDbLike, chronicleId: ID): Promise<string> {
  const data = await collectChronicleData(db, chronicleId)
  return generateBookHtml(data)
}

/** Download the book export for a chronicle as a single .html file. */
export async function downloadBookHtml(db: ChronicleDbLike, chronicleId: ID): Promise<string> {
  const data = await collectChronicleData(db, chronicleId)
  const html = generateBookHtml(data)
  downloadFile(exportFileName(data.chronicle, 'book', 'html'), html, 'text/html')
  return html
}

/** Convenience over the shared database. */
export async function downloadBookHtmlForActiveChronicle(chronicleId: ID): Promise<string> {
  return downloadBookHtml(getDb(), chronicleId)
}
