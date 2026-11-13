// Stream D — Quiet writing stats panel (Feature 7).
//
// A small, calm panel that states the record and nothing more: how much was
// written, how many entries, how the memories stand. No streaks, no goals,
// no comparisons, no judgments. Two variants share the same loader: the
// compact panel for the Dashboard, the fuller one for the Archive.
import { useEffect, useState } from 'react'
import { computeWritingStatsForChronicle, type WritingStats } from '../lib/stats'
import { getDb, type ChronicleDbLike } from '../lib/export'

export interface WritingStatsPanelProps {
  /** The chronicle to count. Null renders nothing. */
  chronicleId: string | null
  /** 'compact' for the Dashboard, 'full' for the Archive. */
  variant?: 'compact' | 'full'
  /** Test seam — defaults to the shared database. */
  db?: ChronicleDbLike
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint dark:text-parchment/60">{label}</dt>
      <dd className="mt-1 font-serif text-2xl font-semibold">{value}</dd>
    </div>
  )
}

export default function WritingStatsPanel({ chronicleId, variant = 'compact', db: dbProp }: WritingStatsPanelProps) {
  const db = dbProp ?? getDb()
  const [stats, setStats] = useState<WritingStats | null>(null)

  useEffect(() => {
    if (!chronicleId) {
      setStats(null)
      return
    }
    let cancelled = false
    void computeWritingStatsForChronicle(db, chronicleId)
      .then((s) => {
        if (!cancelled) setStats(s)
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
    return () => {
      cancelled = true
    }
  }, [chronicleId, db])

  if (!chronicleId) return null

  const eraSpan =
    stats && stats.earliestEra && stats.latestEra
      ? stats.earliestEra === stats.latestEra
        ? stats.earliestEra
        : `${stats.earliestEra} — ${stats.latestEra}`
      : '—'

  return (
    <section
      aria-labelledby="writing-stats-heading"
      className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card"
    >
      <h2 id="writing-stats-heading" className="font-serif text-xl font-semibold">
        The record so far
      </h2>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
        What has been written, counted plainly. Nothing here is a target.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Words written" value={stats ? stats.totalWords.toLocaleString() : '—'} />
        <Stat label="Journal entries" value={stats ? String(stats.entriesCount) : '—'} />
        <Stat label="Memories kept" value={stats ? String(stats.memoriesKept) : '—'} />
        <Stat label="Memories lost" value={stats ? String(stats.memoriesLost) : '—'} />
        {variant === 'full' && (
          <>
            <Stat label="Memories altered" value={stats ? String(stats.memoriesAltered) : '—'} />
            <Stat label="People" value={stats ? String(stats.peopleCount) : '—'} />
            <Stat label="Places" value={stats ? String(stats.placesCount) : '—'} />
            <Stat label="Story threads" value={stats ? String(stats.threadsCount) : '—'} />
          </>
        )}
      </dl>
      {variant === 'full' && (
        <div className="mt-4 space-y-3 text-sm">
          <p>
            <span className="font-medium">Eras covered: </span>
            {eraSpan}
          </p>
          {stats && Object.keys(stats.entriesPerEra).length > 0 && (
            <div>
              <h3 className="font-medium">Entries per era</h3>
              <ul className="mt-1 space-y-1">
                {Object.entries(stats.entriesPerEra).map(([era, count]) => (
                  <li key={era} className="flex justify-between gap-2">
                    <span>{era}</span>
                    <span className="font-semibold">
                      {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
