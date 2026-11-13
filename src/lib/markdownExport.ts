// Stream D — Markdown export (files for the .zip bundle + single-file fallback).
//
// This is the *exporter*: it turns a chronicle into readable Markdown files.
// It is intentionally separate from src/lib/markdown.ts, which is the
// *renderer* that turns Markdown into HTML for display. Every file carries
// the record's stable id so a printed chronicle can be traced back to its
// database row; cross-references are plain text ("Memory: <title> (<id>)").
// All content is the player's own writing; nothing is copied from any rulebook.
import { slugify } from './export'
import type { ChronicleData } from './export'

export type MarkdownFiles = Record<string, string>

function heading(level: number, text: string): string {
  return `${'#'.repeat(level)} ${text}\n`
}

function field(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  return `- **${label}:** ${value}\n`
}

function section(title: string, body: string): string {
  return body.trim() ? `${heading(2, title)}\n${body.trim()}\n\n` : ''
}

function refLine(label: string, title: string, id: string): string {
  return `- ${label}: ${title} (${id})\n`
}

function journalFileName(entryNumber: number, title: string): string {
  return `Journal/${String(entryNumber).padStart(3, '0')}-${slugify(title) || 'entry'}.md`
}

/** One Markdown file per section, plus one file per journal entry. */
export function buildMarkdownFiles(data: ChronicleData): MarkdownFiles {
  const { chronicle: c } = data
  const files: MarkdownFiles = {}
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
  const memories = byId(data.memories)
  const people = byId(data.people)
  const places = byId(data.places)
  const threads = byId(data.threads)

  files['Chronicle Overview.md'] =
    heading(1, c.title) +
    `\n${c.concept}\n\n` +
    field('Vampire', c.vampireName) +
    field('Pronouns', c.pronouns) +
    field('Age', `${c.currentAge} (started at ${c.startingAge})`) +
    field('Era', `${c.currentEra} (started in ${c.startingEra})`) +
    field('Location', `${c.currentLocation} (started in ${c.startingLocation})`) +
    field('Status', c.status) +
    field('Tension', c.tension) +
    field('Chronicle ID', c.id) +
    `\n${section(
      'At a glance',
      [
        `- ${data.memories.length} memories (${data.memories.filter((m) => m.status === 'Lost').length} lost, ${data.memories.filter((m) => m.status === 'Altered').length} altered)`,
        `- ${data.journal.length} journal entries`,
        `- ${data.people.length} people, ${data.places.length} places, ${data.threads.length} story threads`,
        `- ${data.timeline.length} timeline events, ${data.recaps.length} recaps`,
      ].join('\n'),
    )}`

  files['Character Sheet.md'] =
    heading(1, `Character Sheet — ${c.vampireName}`) +
    `\n${field('Chronicle', `${c.title} (${c.id})`)}` +
    section(
      'Skills',
      data.skills.map((s) => `- **${s.name}**${s.value ? ` — ${s.value}` : ''}${s.description ? `: ${s.description}` : ''}${s.notes ? ` (${s.notes})` : ''} [${s.id}]`).join('\n'),
    ) +
    section(
      'Resources',
      data.resources.map((r) => `- **${r.name}**${r.quantity ? ` — ${r.quantity}` : ''}${r.description ? `: ${r.description}` : ''}${r.notes ? ` (${r.notes})` : ''} [${r.id}]`).join('\n'),
    ) +
    section(
      'Change history',
      data.stateChanges
        .map((ch) => `- ${ch.field}: ${ch.oldValue ?? '—'} → ${ch.newValue ?? '—'}${ch.note ? ` — ${ch.note}` : ''} [${ch.id}]`)
        .join('\n'),
    )

  files['Memories.md'] =
    heading(1, 'Memories') +
    '\n' +
    data.memories
      .map((m) => {
        const versions = data.memoryVersions.filter((v) => v.memoryId === m.id)
        let out = heading(2, `${m.code} — ${m.title}`) +
          field('Status', m.status) +
          field('Era', m.occurredEra ?? m.recordedEra) +
          field('Tags', m.tags.join(', ')) +
          field('ID', m.id) +
          `\n${m.text}\n`
        for (const personId of m.personIds) {
          const p = people.get(personId)
          if (p) out += refLine('Person', p.name, p.id)
        }
        for (const placeId of m.placeIds) {
          const p = places.get(placeId)
          if (p) out += refLine('Place', p.name, p.id)
        }
        if (versions.length > 0) {
          out += '\n**Earlier versions:**\n'
          for (const v of versions) {
            out += `\n- v${v.version} (${v.status}${v.changedEra ? `, ${v.changedEra}` : ''}${v.note ? ` — ${v.note}` : ''}): ${v.text}\n`
          }
        }
        return out
      })
      .join('\n')

  for (const entry of data.journal) {
    files[journalFileName(entry.number, entry.title)] =
      heading(1, `Entry ${entry.number} — ${entry.title}`) +
      `\n${field('Era', entry.era)}${field('Age', entry.age)}${field('Location', entry.location)}` +
      field('Prompt', entry.promptText) +
      field('Prompt reference', entry.promptRef) +
      field('ID', entry.id) +
      `\n${entry.body}\n` +
      section('Choices', entry.choices ?? '') +
      section('Consequences', entry.consequences ?? '') +
      section('Long term', entry.longTerm ?? '') +
      section(
        'Linked records',
        [
          ...entry.memoryIds.map((id) => { const m = memories.get(id); return m ? refLine('Memory', `${m.code} — ${m.title}`, m.id) : '' }),
          ...entry.personIds.map((id) => { const p = people.get(id); return p ? refLine('Person', p.name, p.id) : '' }),
          ...entry.placeIds.map((id) => { const p = places.get(id); return p ? refLine('Place', p.name, p.id) : '' }),
          ...entry.threadIds.map((id) => { const t = threads.get(id); return t ? refLine('Thread', t.title, t.id) : '' }),
        ].filter(Boolean).join(''),
      )
  }

  files['Timeline.md'] =
    heading(1, 'Timeline') +
    '\n' +
    data.timeline
      .map((e) => `- **${e.era}** — ${e.title}${e.description ? `: ${e.description}` : ''} (${e.type}, ${e.id})`)
      .join('\n') +
    '\n'

  files['People.md'] =
    heading(1, 'People') +
    '\n' +
    data.people
      .map((p) => heading(2, p.name) +
        field('Status', p.status) +
        field('Relationship', p.relationship) +
        field('First appearance', p.firstAppearance) +
        field('Last known era', p.lastKnownEra) +
        field('Wants', p.wants) +
        field('ID', p.id) +
        (p.description ? `\n${p.description}\n` : '') +
        (p.notes ? `\n${p.notes}\n` : ''),
      )
      .join('\n')

  files['Places.md'] =
    heading(1, 'Places') +
    '\n' +
    data.places
      .map((p) => heading(2, p.name) +
        field('Region', p.region) +
        field('First visit', p.firstVisit) +
        field('Last visit', p.lastVisit) +
        field('Significance', p.significance) +
        field('ID', p.id) +
        (p.description ? `\n${p.description}\n` : ''),
      )
      .join('\n')

  files['Story Threads.md'] =
    heading(1, 'Story Threads') +
    '\n' +
    data.threads
      .map((t) => heading(2, t.title) +
        field('Status', t.status) +
        field('Introduced', t.introducedEra) +
        field('ID', t.id) +
        (t.description ? `\n${t.description}\n` : '') +
        (t.resolutionNotes ? `\n**Resolution:** ${t.resolutionNotes}\n` : ''),
      )
      .join('\n')

  files['Recaps.md'] =
    heading(1, 'Recaps') +
    '\n' +
    data.recaps
      .map((r) => heading(2, r.title) + field('Era', r.era) + field('ID', r.id) + `\n${r.body}\n`)
      .join('\n')

  return files
}

/** Single-file fallback: every section concatenated, in reading order. */
export function buildCombinedMarkdown(data: ChronicleData): string {
  const files = buildMarkdownFiles(data)
  const order = [
    'Chronicle Overview.md',
    'Character Sheet.md',
    'Memories.md',
    ...Object.keys(files).filter((name) => name.startsWith('Journal/')).sort(),
    'Timeline.md',
    'People.md',
    'Places.md',
    'Story Threads.md',
    'Recaps.md',
  ]
  return order
    .filter((name) => files[name])
    .map((name) => files[name].trimEnd())
    .join('\n\n---\n\n') + '\n'
}
