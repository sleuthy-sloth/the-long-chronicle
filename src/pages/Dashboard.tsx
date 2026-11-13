// Dashboard (Stream A): the front page of the archive. Shows the active
// chronicle at a glance — vampire, age, era, location, active memories,
// skills/resources, recent journal entries, unresolved threads — and quick
// actions into the rest of the app. Pages owned by other streams are linked
// to normally; when one is still a placeholder the link still lands
// gracefully (see App.tsx).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/database'
import type { JournalEntry, Memory, Resource, Skill, StoryThread } from '../db/types'
import { useAppStore } from '../state/store'
import { Badge, Button, EmptyState } from '../components/ui'
import { CreateChronicleDialog } from './Chronicles'
import { formatRelativeTime, pluralize } from '../lib/utils'

interface DashboardData {
  activeMemories: number
  totalMemories: number
  totalEntries: number
  skills: Skill[]
  resources: Resource[]
  recentEntries: JournalEntry[]
  openThreads: StoryThread[]
  lastEntry: JournalEntry | null
}

const QUICK_ACTIONS = [
  { to: '/journal/new', label: 'New Entry', hint: 'Continue the journal', icon: '✎' },
  { to: '/journal', label: 'Continue', hint: 'Pick up the journal', icon: '↝' },
  { to: '/memories', label: 'Add Memory', hint: 'Record what endures', icon: '✧' },
  { to: '/character', label: 'Update Character', hint: 'Skills, resources, state', icon: '☉' },
  { to: '/timeline', label: 'View Timeline', hint: 'The centuries in order', icon: '≋' },
] as const

export default function Dashboard() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const ready = useAppStore((s) => s.ready)
  const [data, setData] = useState<DashboardData | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!activeChronicle) {
      setData(null)
      return
    }
    let cancelled = false
    void (async () => {
      const cid = activeChronicle.id
      const [memories, skills, resources, entries, threads] = await Promise.all([
        db.memories.where('chronicleId').equals(cid).toArray() as Promise<Memory[]>,
        db.skills.where('chronicleId').equals(cid).toArray() as Promise<Skill[]>,
        db.resources.where('chronicleId').equals(cid).toArray() as Promise<Resource[]>,
        db.journalEntries.where('chronicleId').equals(cid).toArray() as Promise<JournalEntry[]>,
        db.storyThreads.where('chronicleId').equals(cid).toArray() as Promise<StoryThread[]>,
      ])
      if (cancelled) return
      const sortedEntries = [...entries].sort((a, b) => b.number - a.number)
      setData({
        activeMemories: memories.filter((m) => m.status === 'Active').length,
        totalMemories: memories.length,
        totalEntries: entries.length,
        skills: skills.slice(0, 5),
        resources: resources.slice(0, 5),
        recentEntries: sortedEntries.slice(0, 3),
        openThreads: threads.filter((t) => t.status === 'Open' || t.status === 'Dormant'),
        lastEntry: sortedEntries[0] ?? null,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [activeChronicle])

  if (!ready) {
    return <p className="text-sm text-ink-soft dark:text-parchment/70">Opening the archive…</p>
  }

  if (!activeChronicle) {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold">The Long Chronicle</h1>
        <p className="mb-6 max-w-xl text-sm leading-relaxed text-ink-soft dark:text-parchment/70">
          An offline companion for playing Thousand Year Old Vampire: one vampire&rsquo;s memories, journal,
          character and timeline, kept in this browser and nowhere else.
        </p>
        <EmptyState
          title="Begin your first chronicle"
          action={<Button onClick={() => setShowCreate(true)}>Create a chronicle</Button>}
        >
          <p>
            A chronicle is a single vampire&rsquo;s thousand years — a name, an era, a place to begin. The record
            starts empty; everything in it will be yours.
          </p>
        </EmptyState>
        <CreateChronicleDialog open={showCreate} onClose={() => setShowCreate(false)} />
      </div>
    )
  }

  const c = activeChronicle
  const skillCount = data ? data.skills.length : 0
  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{c.title}</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
        {c.vampireName}
        {c.pronouns ? ` (${c.pronouns})` : ''} · age {c.currentAge} · {c.currentEra} · {c.currentLocation} ·{' '}
        <Badge tone="gold">{c.status}</Badge>
      </p>
      {c.concept && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft dark:text-parchment/80">{c.concept}</p>}
      {c.tension && <p className="mt-2 max-w-2xl text-sm italic leading-relaxed text-ink-soft dark:text-parchment/70">Tension: {c.tension}</p>}

      {/* Stats */}
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
          <dt className="text-xs uppercase tracking-wide text-ink-faint dark:text-parchment/60">Active memories</dt>
          <dd className="mt-1 font-serif text-2xl font-semibold">
            {data ? data.activeMemories : '—'}
            {data && data.totalMemories > data.activeMemories && (
              <span className="ml-1 text-sm font-normal text-ink-faint dark:text-parchment/60">/ {data.totalMemories}</span>
            )}
          </dd>
        </div>
        <div className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
          <dt className="text-xs uppercase tracking-wide text-ink-faint dark:text-parchment/60">Journal entries</dt>
          <dd className="mt-1 font-serif text-2xl font-semibold">{data ? data.totalEntries : '—'}</dd>
        </div>
        <div className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
          <dt className="text-xs uppercase tracking-wide text-ink-faint dark:text-parchment/60">Open threads</dt>
          <dd className="mt-1 font-serif text-2xl font-semibold">{data ? data.openThreads.length : '—'}</dd>
        </div>
        <div className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
          <dt className="text-xs uppercase tracking-wide text-ink-faint dark:text-parchment/60">Skills</dt>
          <dd className="mt-1 font-serif text-2xl font-semibold">{data ? `${skillCount}${data.resources.length ? ` · ${data.resources.length} ${pluralize(data.resources.length, 'resource')}` : ''}` : '—'}</dd>
        </div>
      </dl>

      {/* Quick actions */}
      <h2 className="mb-3 mt-8 font-serif text-xl font-semibold">Continue the story</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="rounded-lg border border-ink/15 bg-parchment-card p-4 transition-colors hover:border-gold dark:border-parchment/15 dark:bg-charcoal-card dark:hover:border-gold-light"
          >
            <span aria-hidden="true" className="text-lg text-oxblood dark:text-gold-light">
              {a.icon}
            </span>
            <span className="mt-1 block font-medium">{a.label}</span>
            <span className="block text-xs text-ink-soft dark:text-parchment/70">{a.hint}</span>
          </Link>
        ))}
        <Link
          to="/chronicles"
          className="rounded-lg border border-dashed border-ink/25 p-4 transition-colors hover:border-gold dark:border-parchment/25 dark:hover:border-gold-light"
        >
          <span aria-hidden="true" className="text-lg text-oxblood dark:text-gold-light">
            ❦
          </span>
          <span className="mt-1 block font-medium">Switch chronicle</span>
          <span className="block text-xs text-ink-soft dark:text-parchment/70">Or begin another vampire&rsquo;s years</span>
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Recent journal */}
        <section aria-labelledby="recent-journal-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="recent-journal-heading" className="font-serif text-xl font-semibold">Recent journal entries</h2>
            <Link to="/journal" className="text-sm text-oxblood underline dark:text-gold-light">
              All entries →
            </Link>
          </div>
          {!data || data.recentEntries.length === 0 ? (
            <EmptyState title="No journal entries yet">
              <p>The journal is where the centuries happen — one entry at a time.</p>
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {data.recentEntries.map((e) => (
                <li key={e.id}>
                  <Link to={`/journal/${e.id}`} className="block rounded-lg border border-ink/15 bg-parchment-card p-4 hover:border-gold dark:border-parchment/15 dark:bg-charcoal-card dark:hover:border-gold-light">
                    <span className="font-medium">
                      Entry {e.number} — {e.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft dark:text-parchment/70">
                      {e.era}
                      {e.location ? ` · ${e.location}` : ''} · {formatRelativeTime(e.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Threads + character glance */}
        <div className="space-y-8">
          <section aria-labelledby="threads-heading">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="threads-heading" className="font-serif text-xl font-semibold">Unresolved threads</h2>
              <Link to="/timeline" className="text-sm text-oxblood underline dark:text-gold-light">
                Timeline →
              </Link>
            </div>
            {!data || data.openThreads.length === 0 ? (
              <EmptyState title="No open threads">
                <p>Story threads the vampire has left hanging will gather here.</p>
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {data.openThreads.slice(0, 4).map((t) => (
                  <li key={t.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                    <span className="font-medium">{t.title}</span>{' '}
                    <Badge tone={t.status === 'Open' ? 'gold' : 'muted'}>{t.status}</Badge>
                    {t.introducedEra && <span className="mt-0.5 block text-xs text-ink-soft dark:text-parchment/70">Since {t.introducedEra}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="character-glance-heading">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="character-glance-heading" className="font-serif text-xl font-semibold">Character at a glance</h2>
              <Link to="/character" className="text-sm text-oxblood underline dark:text-gold-light">
                Full sheet →
              </Link>
            </div>
            {!data || (data.skills.length === 0 && data.resources.length === 0) ? (
              <EmptyState title="Nothing on the sheet yet">
                <p>Skills and resources live on the character page.</p>
              </EmptyState>
            ) : (
              <div className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                {data.skills.length > 0 && (
                  <p className="text-sm">
                    <strong>Skills:</strong> {data.skills.map((s) => s.name).join(', ')}
                    {data.skills.length >= 5 ? '…' : ''}
                  </p>
                )}
                {data.resources.length > 0 && (
                  <p className="mt-1 text-sm">
                    <strong>Resources:</strong> {data.resources.map((r) => r.name).join(', ')}
                    {data.resources.length >= 5 ? '…' : ''}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
