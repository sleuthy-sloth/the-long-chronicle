// Character snapshots per era (Stream B, Feature 4).
//
// A snapshot is a frozen copy of the character sheet at one era — skills,
// resources and conditions as they stood. Snapshots are immutable: there
// is no editing here, only taking a new one or deleting one (with a
// confirmation step). Pick any two snapshots to see what changed between
// them: what was gained, lost, or altered in the meantime.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/store'
import { Badge, Button, ConfirmDialog, EmptyState } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import {
  createCharacterSnapshot,
  deleteSnapshot,
  diffSnapshots,
  listSnapshots,
  type SnapshotDiff,
} from '../lib/snapshots'
import type { CharacterSnapshot, SnapshotItem } from '../db/types'

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Taken by hand',
  journalEntry: 'From a journal entry',
  timeJump: 'From a time jump',
}

function snapshotLabel(s: CharacterSnapshot): string {
  const parts = [s.era]
  if (s.age !== undefined) parts.push(`age ${s.age}`)
  if (s.location) parts.push(s.location)
  return parts.join(' · ')
}

function ItemList({ items }: { items: SnapshotItem[] }) {
  if (items.length === 0) return <p className="text-sm text-ink-faint dark:text-parchment/50">None recorded.</p>
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.name}>
          <span className="font-medium">{item.name}</span>
          {item.value && <span className="text-ink-soft dark:text-parchment/80"> — {item.value}</span>}
          {item.description && <span className="block text-xs text-ink-soft dark:text-parchment/70">{item.description}</span>}
        </li>
      ))}
    </ul>
  )
}

function DiffSection({
  title,
  added,
  removed,
  changed,
}: {
  title: string
  added: SnapshotItem[]
  removed: SnapshotItem[]
  changed: SnapshotDiff['changedSkills']
}) {
  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-medium text-oxblood dark:text-gold-light">{title}</h4>
        <p className="mt-0.5 text-sm text-ink-soft dark:text-parchment/70">No change.</p>
      </div>
    )
  }
  return (
    <div>
      <h4 className="text-sm font-medium text-oxblood dark:text-gold-light">{title}</h4>
      <ul className="mt-1 space-y-1 text-sm">
        {added.map((item) => (
          <li key={`+${item.name}`}>
            <Badge tone="gold">Added</Badge> <span className="ml-1 font-medium">{item.name}</span>
            {item.value && <span className="text-ink-soft dark:text-parchment/80"> — {item.value}</span>}
          </li>
        ))}
        {removed.map((item) => (
          <li key={`-${item.name}`}>
            <Badge tone="muted">Removed</Badge> <span className="ml-1 font-medium">{item.name}</span>
            {item.value && <span className="text-ink-soft dark:text-parchment/80"> — {item.value}</span>}
          </li>
        ))}
        {changed.map((c) => (
          <li key={`~${c.name}`}>
            <Badge tone="oxblood">Changed</Badge> <span className="ml-1 font-medium">{c.name}</span>
            <span className="text-ink-soft dark:text-parchment/80">
              {' '}
              — from {c.from.value ?? c.from.description ?? '—'} to {c.to.value ?? c.to.description ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Snapshots() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const [snapshots, setSnapshots] = useState<CharacterSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [taking, setTaking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CharacterSnapshot | null>(null)
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const chronicleId = activeChronicle?.id

  async function reload() {
    if (!chronicleId) {
      setLoading(false)
      return
    }
    setSnapshots(await listSnapshots(chronicleId))
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronicleId])

  // Keep the compare picks valid as snapshots come and go.
  useEffect(() => {
    if (compareA && !snapshots.some((s) => s.id === compareA)) setCompareA('')
    if (compareB && !snapshots.some((s) => s.id === compareB)) setCompareB('')
  }, [snapshots, compareA, compareB])

  async function handleSnapshotNow() {
    if (!chronicleId) return
    setTaking(true)
    setError(null)
    try {
      const snap = await createCharacterSnapshot(chronicleId, {
        era: activeChronicle?.currentEra ?? '',
        sourceKind: 'manual',
      })
      setNotice(`Snapshot taken — ${snapshotLabel(snap)}.`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not take the snapshot.')
    } finally {
      setTaking(false)
    }
  }

  const diff = useMemo(() => {
    const a = snapshots.find((s) => s.id === compareA)
    const b = snapshots.find((s) => s.id === compareB)
    if (!a || !b || a.id === b.id) return null
    // diffSnapshots(a, b) reads "from a to b": put the older one first.
    const [earlier, later] =
      a.createdAt.localeCompare(b.createdAt) <= 0 ? [a, b] : [b, a]
    return { earlier, later, diff: diffSnapshots(earlier, later) }
  }, [snapshots, compareA, compareB])

  if (!activeChronicle) {
    return (
      <div>
        <h1 className="mb-5 font-serif text-3xl font-bold">Character snapshots</h1>
        <EmptyState
          title="No chronicle yet"
          action={<Link to="/chronicles" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Chronicles</Link>}
        >
          <p>Create a chronicle first — snapshots belong to a vampire, and there is no vampire yet.</p>
        </EmptyState>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">Character snapshots</h1>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
            {activeChronicle.title} — the character sheet, frozen at one era at a time. Snapshots never change
            after they are taken; take a new one to record a later state.
          </p>
        </div>
        <Button onClick={() => void handleSnapshotNow()} disabled={taking}>
          {taking ? 'Taking snapshot…' : 'Snapshot now'}
        </Button>
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-md bg-gold/15 px-3 py-2 text-sm dark:bg-gold/20">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-oxblood/10 px-3 py-2 text-sm font-semibold text-oxblood">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink-soft dark:text-parchment/70">Loading snapshots…</p>
      ) : snapshots.length === 0 ? (
        <EmptyState title="No snapshots yet">
          <p>
            Take the first snapshot to freeze the character sheet as it stands — its skills, resources and
            conditions, at {activeChronicle.currentEra}. Later snapshots let you see what changed between eras.
          </p>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Compare any two snapshots */}
          <section aria-labelledby="compare-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-5 dark:border-parchment/15 dark:bg-charcoal-card">
            <h2 id="compare-heading" className="font-serif text-xl font-semibold">Compare two snapshots</h2>
            <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
              Pick any two — the earlier one is read as the starting point, whatever order you pick them in.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="compare-a" className="block text-sm font-semibold">First snapshot</label>
                <select
                  id="compare-a"
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                  className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel"
                >
                  <option value="">Choose…</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>{snapshotLabel(s)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="compare-b" className="block text-sm font-semibold">Second snapshot</label>
                <select
                  id="compare-b"
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                  className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel"
                >
                  <option value="">Choose…</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>{snapshotLabel(s)}</option>
                  ))}
                </select>
              </div>
            </div>
            {compareA && compareB && compareA === compareB && (
              <p className="mt-3 text-sm text-ink-soft dark:text-parchment/70">Pick two different snapshots to compare them.</p>
            )}
            {diff && (
              <div className="mt-4 space-y-4 border-t border-ink/10 pt-4 dark:border-parchment/10">
                <p className="text-sm">
                  From <strong>{snapshotLabel(diff.earlier)}</strong> to <strong>{snapshotLabel(diff.later)}</strong>:
                </p>
                <DiffSection
                  title="Skills"
                  added={diff.diff.addedSkills}
                  removed={diff.diff.removedSkills}
                  changed={diff.diff.changedSkills}
                />
                <DiffSection
                  title="Resources"
                  added={diff.diff.addedResources}
                  removed={diff.diff.removedResources}
                  changed={diff.diff.changedResources}
                />
                <div>
                  <h4 className="text-sm font-medium text-oxblood dark:text-gold-light">Conditions</h4>
                  {diff.diff.addedConditions.length === 0 && diff.diff.removedConditions.length === 0 ? (
                    <p className="mt-0.5 text-sm text-ink-soft dark:text-parchment/70">No change.</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm">
                      {diff.diff.addedConditions.map((c) => (
                        <li key={`+${c}`}><Badge tone="gold">Added</Badge> <span className="ml-1">{c}</span></li>
                      ))}
                      {diff.diff.removedConditions.map((c) => (
                        <li key={`-${c}`}><Badge tone="muted">Removed</Badge> <span className="ml-1">{c}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Snapshot list, newest first */}
          <section aria-labelledby="list-heading">
            <h2 id="list-heading" className="mb-3 font-serif text-xl font-semibold">
              All snapshots — newest first
            </h2>
            <ul className="space-y-3">
              {snapshots.map((s) => {
                const expanded = expandedId === s.id
                return (
                  <li key={s.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-serif text-xl font-semibold">{snapshotLabel(s)}</h3>
                        <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">
                          Taken {formatRelativeTime(s.createdAt)} · {SOURCE_LABEL[s.sourceKind ?? 'manual'] ?? 'Taken by hand'} ·{' '}
                          {s.skills.length} {s.skills.length === 1 ? 'skill' : 'skills'} · {s.resources.length}{' '}
                          {s.resources.length === 1 ? 'resource' : 'resources'} · {s.conditions.length}{' '}
                          {s.conditions.length === 1 ? 'condition' : 'conditions'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : s.id)}>
                          {expanded ? 'Hide details' : 'Show details'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="mt-4 grid gap-4 border-t border-ink/10 pt-4 dark:border-parchment/10 sm:grid-cols-3">
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-oxblood dark:text-gold-light">Skills</h4>
                          <ItemList items={s.skills} />
                        </div>
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-oxblood dark:text-gold-light">Resources</h4>
                          <ItemList items={s.resources} />
                        </div>
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-oxblood dark:text-gold-light">Conditions</h4>
                          {s.conditions.length === 0 ? (
                            <p className="text-sm text-ink-faint dark:text-parchment/50">None recorded.</p>
                          ) : (
                            <ul className="space-y-1 text-sm">
                              {s.conditions.map((c) => (
                                <li key={c}>{c}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <p className="text-sm">
            <Link to="/character" className="text-oxblood underline dark:text-gold-light">Back to the character sheet →</Link>
          </p>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          const d = deleting
          void (async () => {
            await deleteSnapshot(d.id)
            setDeleting(null)
            setNotice(`Snapshot from ${d.era} deleted.`)
            await reload()
          })()
        }}
        title={`Delete the snapshot from ${deleting?.era ?? ''}?`}
        confirmLabel="Delete snapshot"
      >
        <p>
          The frozen record of the character at {deleting?.era ?? 'that era'} will be gone. The live character
          sheet is untouched — only this snapshot is deleted, and there is no undo.
        </p>
      </ConfirmDialog>
    </div>
  )
}
