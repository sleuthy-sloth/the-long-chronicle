// Memory Review Mode (Stream B, Feature 3).
//
// A quiet place to revisit the archive. The queue puts memories that have
// never been revisited first, then the ones revisited longest ago. Nothing
// here is a score, a streak, or a goal — just the memories, in an order
// that surfaces what has waited longest, and a note of when each was last
// looked at. "Revisited" only stamps the time; "Skip" only moves on.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/store'
import { Button, EmptyState } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import { listReviewQueue, markReviewed, reviewCounts, type ReviewCounts } from '../lib/review'
import type { Memory } from '../db/types'

function lastReviewedLabel(m: Memory): string {
  if (!m.lastReviewedAt) return 'Not yet revisited'
  return `Last revisited ${formatRelativeTime(m.lastReviewedAt)}`
}

export default function Review() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const [queue, setQueue] = useState<Memory[]>([])
  const [counts, setCounts] = useState<ReviewCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [focusIndex, setFocusIndex] = useState(0)
  const [randomMemory, setRandomMemory] = useState<Memory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chronicleId = activeChronicle?.id

  async function reload() {
    if (!chronicleId) {
      setLoading(false)
      return
    }
    const [q, c] = await Promise.all([listReviewQueue(chronicleId), reviewCounts(chronicleId)])
    setQueue(q)
    setCounts(c)
    setFocusIndex(0)
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronicleId])

  function pickRandom(excludeId?: string): Memory | null {
    const pool = excludeId ? queue.filter((m) => m.id !== excludeId) : queue
    const source = pool.length > 0 ? pool : queue
    if (source.length === 0) return null
    return source[Math.floor(Math.random() * source.length)]
  }

  async function handleReviewed(memory: Memory) {
    setError(null)
    try {
      await markReviewed(memory.id)
      await reload()
      // After stamping, the memory sorts to the end of the queue; the next
      // one up is the least recently revisited. In random mode, draw a new
      // memory instead of returning to the list.
      if (randomMemory) {
        const next = pickRandom(memory.id)
        setRandomMemory(next)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark the memory revisited.')
    }
  }

  /** Move on without stamping — only reorders this session's list. */
  function handleSkip(memory: Memory) {
    if (randomMemory) {
      setRandomMemory(pickRandom(memory.id))
      return
    }
    const idx = queue.findIndex((m) => m.id === memory.id)
    const rest = queue.filter((m) => m.id !== memory.id)
    setQueue([...rest, memory])
    // Focus lands on the memory that slides into the skipped one's place,
    // or wraps to the top when the skipped one was last.
    setFocusIndex(rest.length === 0 ? 0 : idx < rest.length ? idx : 0)
  }

  if (!activeChronicle) {
    return (
      <div>
        <h1 className="mb-5 font-serif text-3xl font-bold">Review memories</h1>
        <EmptyState
          title="No chronicle yet"
          action={<Link to="/chronicles" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Chronicles</Link>}
        >
          <p>Create a chronicle first — there are no memories to revisit yet.</p>
        </EmptyState>
      </div>
    )
  }

  const current = queue.length > 0 ? queue[Math.min(focusIndex, queue.length - 1)] : null

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-serif text-3xl font-bold">Review memories</h1>
        <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
          {activeChronicle.title} — a quiet pass through what the vampire still remembers. Take your time;
          nothing here is timed or tallied.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-oxblood/10 px-3 py-2 text-sm font-semibold text-oxblood">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink-soft dark:text-parchment/70">Gathering the memories…</p>
      ) : counts && counts.totalActive === 0 ? (
        <EmptyState
          title="No active memories to revisit"
          action={<Link to="/memories" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Memories</Link>}
        >
          <p>Active memories will appear here when they are recorded. Lost, altered and archived memories stay on their own record.</p>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Counts — plain numbers, not a score. */}
          <p className="text-sm text-ink-soft dark:text-parchment/70" aria-live="polite">
            {counts && (
              <>
                {counts.reviewed} revisited · {counts.neverReviewed} not yet revisited · {counts.totalActive}{' '}
                {counts.totalActive === 1 ? 'active memory' : 'active memories'} in all.
              </>
            )}
          </p>

          {/* Random draw */}
          {randomMemory ? (
            <section aria-labelledby="random-heading" className="rounded-lg border border-gold/40 bg-parchment-card p-5 dark:border-gold/25 dark:bg-charcoal-card">
              <h2 id="random-heading" className="font-serif text-xl font-semibold">One memory, drawn at random</h2>
              <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">
                {randomMemory.code}
                {randomMemory.occurredEra ? ` · ${randomMemory.occurredEra}` : ''} · {lastReviewedLabel(randomMemory)}
              </p>
              <h3 className="mt-3 font-serif text-2xl font-semibold">{randomMemory.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{randomMemory.text}</p>
              {randomMemory.tags.length > 0 && (
                <p className="mt-3 text-xs text-ink-soft dark:text-parchment/70">Tags: {randomMemory.tags.join(', ')}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void handleReviewed(randomMemory)}>Revisited</Button>
                <Button variant="outline" onClick={() => setRandomMemory(pickRandom(randomMemory.id))}>
                  Show me another
                </Button>
                <Link to={`/memories/${randomMemory.id}`} className="rounded-md border border-ink/25 px-4 py-2 text-sm font-medium dark:border-parchment/25">
                  Open
                </Link>
                <Button variant="ghost" onClick={() => setRandomMemory(null)}>
                  Back to the list
                </Button>
              </div>
            </section>
          ) : (
            <div>
              <Button
                variant="outline"
                onClick={() => setRandomMemory(pickRandom())}
                disabled={queue.length === 0}
              >
                Show me one at random
              </Button>
            </div>
          )}

          {/* Current memory in the queue */}
          {current && !randomMemory && (
            <section aria-labelledby="current-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-5 dark:border-parchment/15 dark:bg-charcoal-card">
              <h2 id="current-heading" className="font-serif text-xl font-semibold">Next to revisit</h2>
              <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">
                {current.code}
                {current.occurredEra ? ` · ${current.occurredEra}` : ''} · {lastReviewedLabel(current)}
              </p>
              <h3 className="mt-3 font-serif text-2xl font-semibold">{current.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{current.text}</p>
              {current.tags.length > 0 && (
                <p className="mt-3 text-xs text-ink-soft dark:text-parchment/70">Tags: {current.tags.join(', ')}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void handleReviewed(current)}>Revisited</Button>
                <Link to={`/memories/${current.id}`} className="rounded-md border border-ink/25 px-4 py-2 text-sm font-medium dark:border-parchment/25">
                  Open
                </Link>
                <Button variant="outline" onClick={() => handleSkip(current)}>
                  Skip
                </Button>
              </div>
            </section>
          )}

          {/* The queue, in order */}
          <section aria-labelledby="queue-heading">
            <h2 id="queue-heading" className="mb-3 font-serif text-xl font-semibold">In order — least recently revisited first</h2>
            <ol className="space-y-2">
              {queue.map((m, i) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4 ${
                    current?.id === m.id && !randomMemory
                      ? 'border-oxblood/50 bg-parchment-card dark:border-gold/40 dark:bg-charcoal-card'
                      : 'border-ink/15 bg-parchment-card dark:border-parchment/15 dark:bg-charcoal-card'
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setFocusIndex(i)}
                    aria-label={`Revisit ${m.title}`}
                  >
                    <p className="font-medium">
                      {m.code} — {m.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">
                      {m.occurredEra ? `${m.occurredEra} · ` : ''}
                      {lastReviewedLabel(m)}
                    </p>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" onClick={() => void handleReviewed(m)}>
                      Revisited
                    </Button>
                    <Link to={`/memories/${m.id}`} className="rounded-md px-3 py-1.5 text-sm font-medium text-oxblood underline dark:text-gold-light">
                      Open
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => handleSkip(m)}>
                      Skip
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <p className="text-sm">
            <Link to="/memories" className="text-oxblood underline dark:text-gold-light">Back to Memories →</Link>
          </p>
        </div>
      )}
    </div>
  )
}
