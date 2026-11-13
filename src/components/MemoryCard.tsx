import { Link } from 'react-router-dom'
import type { Memory } from '../db/types'
import { MEMORY_STATUS_META } from '../lib/memories'

export default function MemoryCard({ memory }: { memory: Memory }) {
  const meta = MEMORY_STATUS_META[memory.status]
  const excerpt = memory.text.length > 220 ? `${memory.text.slice(0, 220)}…` : memory.text
  return (
    <article className="rounded-lg border border-gold/40 bg-parchment-card p-4 shadow-sm dark:border-gold/25 dark:bg-charcoal-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint dark:text-gold-light">
            {memory.code}
            {memory.occurredEra ? ` · ${memory.occurredEra}` : ''}
          </p>
          <h3 className="font-serif text-xl leading-snug">
            <Link
              to={`/memories/${memory.id}`}
              className="text-ink hover:text-oxblood dark:text-parchment dark:hover:text-gold-light"
            >
              {memory.title}
            </Link>
          </h3>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
          aria-label={`Status: ${meta.label}. ${meta.hint}`}
        >
          <span aria-hidden="true">{meta.icon} </span>
          {meta.label}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-parchment/85">{excerpt}</p>
      {memory.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
          {memory.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-parchment-deep px-2 py-0.5 text-xs text-ink-soft dark:bg-charcoal-panel dark:text-parchment/80"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-faint dark:text-parchment/60">
        {memory.personIds.length > 0 && `${memory.personIds.length} ${memory.personIds.length === 1 ? 'person' : 'people'} · `}
        {memory.placeIds.length > 0 && `${memory.placeIds.length} ${memory.placeIds.length === 1 ? 'place' : 'places'} · `}
        Recorded {memory.recordedEra ?? new Date(memory.createdAt).toLocaleDateString()}
      </p>
    </article>
  )
}
