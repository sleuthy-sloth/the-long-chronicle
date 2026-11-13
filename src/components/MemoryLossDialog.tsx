import { useState } from 'react'
import type { Memory } from '../db/types'
import { MEMORY_STATUS_META } from '../lib/memories'

export interface MemoryChangeInput {
  note: string
  changedEra: string
  newText?: string
}

interface Props {
  memory: Memory
  /** 'lose' marks the memory lost (text preserved); 'alter' records a new wording. */
  mode: 'lose' | 'alter'
  onConfirm: (input: MemoryChangeInput) => void
  onCancel: () => void
}

/**
 * Confirmation dialog for losing or altering a memory.
 * Shows the current text in full so the player sees exactly what is being
 * kept on record, and asks for the date/era of the change plus a note.
 * A memory is never deleted from this dialog — losing only changes status.
 */
export default function MemoryLossDialog({ memory, mode, onConfirm, onCancel }: Props) {
  const [note, setNote] = useState('')
  const [changedEra, setChangedEra] = useState(memory.recordedEra ?? memory.occurredEra ?? '')
  const [newText, setNewText] = useState(memory.text)

  const title = mode === 'lose' ? `Mark ${memory.code} as lost?` : `Alter ${memory.code}?`
  const confirmLabel = mode === 'lose' ? 'Mark as lost' : 'Save altered version'
  const valid = mode === 'lose' || newText.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-change-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-parchment-card p-6 shadow-xl dark:bg-charcoal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="memory-change-title" className="font-serif text-2xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
          {mode === 'lose'
            ? 'The memory will be marked Lost. Its original text stays on the record — nothing is deleted — and a version is written to its history.'
            : 'The current wording will be preserved as a prior version in the history, and the new wording becomes the current text.'}
        </p>

        <section aria-label="Current text" className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-faint">Current text</h3>
          <blockquote className="mt-1 whitespace-pre-wrap rounded border-l-4 border-gold bg-parchment-deep/60 p-3 text-sm leading-relaxed dark:bg-charcoal-panel">
            {memory.text}
          </blockquote>
          <p className="mt-1 text-xs text-ink-faint">
            Status now: {MEMORY_STATUS_META[memory.status].label} · Recorded{' '}
            {memory.recordedEra ?? new Date(memory.createdAt).toLocaleDateString()}
          </p>
        </section>

        {mode === 'alter' && (
          <div className="mt-4">
            <label htmlFor="memory-new-text" className="block text-sm font-semibold">
              New wording
            </label>
            <textarea
              id="memory-new-text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel"
            />
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="memory-change-era" className="block text-sm font-semibold">
              Date / era of change
            </label>
            <input
              id="memory-change-era"
              type="text"
              value={changedEra}
              onChange={(e) => setChangedEra(e.target.value)}
              placeholder="e.g. late 14th century"
              className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel"
            />
          </div>
          <div>
            <label htmlFor="memory-change-note" className="block text-sm font-semibold">
              Note — why did this happen?
            </label>
            <input
              id="memory-change-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. taken in the fire at the abbey"
              className="mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() =>
              onConfirm({
                note,
                changedEra,
                newText: mode === 'alter' ? newText : undefined,
              })
            }
            className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
