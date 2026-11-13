// Global search (Stream A). Searches every searchable table for the active
// chronicle (or all chronicles when none is active) and returns lightweight
// results the SearchPalette can navigate to. Pure Dexie reads + in-memory
// matching — the dataset is a single player's archive, so a full scan is
// cheaper than maintaining a search index.
//
// Other streams' data becomes searchable here automatically: add a table to
// SEARCHABLE below when a new entity type lands.
import { db } from '../db/database'

export type SearchResultKind =
  | 'Chronicle'
  | 'Memory'
  | 'Journal entry'
  | 'Person'
  | 'Place'
  | 'Thread'
  | 'Skill'
  | 'Resource'
  | 'Note'
  | 'Recap'

export interface SearchResult {
  kind: SearchResultKind
  id: string
  title: string
  snippet: string
  route: string
}

const MAX_PER_KIND = 5
const MAX_TOTAL = 30

function matches(haystack: Array<string | undefined>, query: string): boolean {
  return haystack.some((h) => h?.toLowerCase().includes(query))
}

function snippet(text: string | undefined, query: string, max = 90): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const idx = clean.toLowerCase().indexOf(query)
  if (idx < 0) return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
  const start = Math.max(0, idx - 30)
  const piece = clean.slice(start, start + max)
  return `${start > 0 ? '…' : ''}${piece}${start + max < clean.length ? '…' : ''}`
}

export async function searchAll(queryRaw: string, chronicleId?: string | null): Promise<SearchResult[]> {
  const query = queryRaw.trim().toLowerCase()
  if (query.length < 2) return []
  const results: SearchResult[] = []
  const push = (r: SearchResult) => {
    if (results.length < MAX_TOTAL) results.push(r)
  }
  const inScope = (rowChronicleId: string) => !chronicleId || rowChronicleId === chronicleId

  const chronicles = await db.chronicles.toArray()
  for (const c of chronicles) {
    if (results.length >= MAX_TOTAL) break
    if (matches([c.title, c.vampireName, c.concept, c.currentEra, c.currentLocation], query)) {
      push({ kind: 'Chronicle', id: c.id, title: c.title, snippet: `${c.vampireName} — ${c.currentEra}`, route: '/chronicles' })
    }
  }

  const take = <T>(rows: T[], pred: (r: T) => boolean) => rows.filter(pred).slice(0, MAX_PER_KIND)

  for (const m of take(await db.memories.toArray(), (m) => inScope(m.chronicleId) && matches([m.code, m.title, m.text, m.notes, ...m.tags], query))) {
    push({ kind: 'Memory', id: m.id, title: `${m.code} — ${m.title}`, snippet: snippet(m.text, query), route: `/memories/${m.id}` })
  }
  for (const e of take(await db.journalEntries.toArray(), (e) => inScope(e.chronicleId) && matches([e.title, e.body, e.era, e.location, e.promptText, ...e.tags], query))) {
    push({ kind: 'Journal entry', id: e.id, title: `Entry ${e.number} — ${e.title}`, snippet: snippet(e.body, query), route: `/journal/${e.id}` })
  }
  for (const p of take(await db.people.toArray(), (p) => inScope(p.chronicleId) && matches([p.name, p.description, p.relationship, p.notes], query))) {
    push({ kind: 'Person', id: p.id, title: p.name, snippet: snippet(p.description ?? p.relationship, query), route: '/people' })
  }
  for (const p of take(await db.places.toArray(), (p) => inScope(p.chronicleId) && matches([p.name, p.description, p.region, p.significance], query))) {
    push({ kind: 'Place', id: p.id, title: p.name, snippet: snippet(p.description ?? p.region, query), route: '/people' })
  }
  for (const t of take(await db.storyThreads.toArray(), (t) => inScope(t.chronicleId) && matches([t.title, t.description, t.resolutionNotes], query))) {
    push({ kind: 'Thread', id: t.id, title: t.title, snippet: snippet(t.description, query), route: '/timeline' })
  }
  for (const s of take(await db.skills.toArray(), (s) => inScope(s.chronicleId) && matches([s.name, s.description, s.value, s.notes], query))) {
    push({ kind: 'Skill', id: s.id, title: s.name, snippet: snippet(s.description ?? s.value, query), route: '/character' })
  }
  for (const r of take(await db.resources.toArray(), (r) => inScope(r.chronicleId) && matches([r.name, r.description, r.quantity, r.notes], query))) {
    push({ kind: 'Resource', id: r.id, title: r.name, snippet: snippet(r.description ?? r.quantity, query), route: '/character' })
  }
  for (const n of take(await db.quickNotes.toArray(), (n) => inScope(n.chronicleId) && matches([n.text], query))) {
    push({ kind: 'Note', id: n.id, title: snippet(n.text, query, 60) || 'Note', snippet: '', route: '/journal' })
  }
  for (const r of take(await db.recaps.toArray(), (r) => inScope(r.chronicleId) && matches([r.title, r.body, r.era], query))) {
    push({ kind: 'Recap', id: r.id, title: r.title, snippet: snippet(r.body, query), route: '/timeline' })
  }
  return results
}
