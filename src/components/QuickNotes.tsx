// Quick notes (Stream C).
//
// Temporary notes — a sentence caught mid-thought — with a "Convert to…"
// action that promotes the note into a real record (journal draft,
// memory, person, place, or story thread) with the note text prefilled,
// and marks the note converted. The note row is kept afterwards, as a
// receipt of where the idea went.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/store'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Select, Textarea } from './ui'
import { editorFontSizeStyle } from '../lib/editorFont'
import { useLiveList } from '../lib/live'
import {
  QUICK_NOTE_TARGETS,
  convertQuickNote,
  createQuickNote,
  deleteQuickNote,
  listQuickNotes,
} from '../lib/notes'
import type { QuickNoteTarget } from '../lib/notes'
import { formatRelativeTime } from '../lib/utils'

function convertedLabel(convertedTo: string | null | undefined): string | null {
  if (!convertedTo) return null
  const [target] = convertedTo.split(':')
  return QUICK_NOTE_TARGETS.find((t) => t.value === target)?.label ?? target
}

function convertedLink(convertedTo: string | null | undefined): { to: string; label: string } | null {
  if (!convertedTo) return null
  const [target, id] = convertedTo.split(':')
  if (!id) return null
  if (target === 'person') return { to: `/people/${id}`, label: 'Open person' }
  if (target === 'place') return { to: `/places/${id}`, label: 'Open place' }
  if (target === 'thread') return { to: '/threads', label: 'Open threads' }
  if (target === 'memory') return { to: `/memories/${id}`, label: 'Open memory' }
  if (target === 'journal') return { to: '/journal', label: 'Open journal' }
  return null
}

export default function QuickNotes() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const chronicleId = activeChronicle?.id ?? null
  // Same editor font-size setting as the journal editor (Gap C): subscribed
  // from the shared store, so it tracks Settings live and persists via Dexie.
  const editorStyle = editorFontSizeStyle(useAppStore((s) => s.settings.editorFontSize))
  const notes = useLiveList(() => (chronicleId ? listQuickNotes(chronicleId) : Promise.resolve([])), [chronicleId])
  const [text, setText] = useState('')
  const [targets, setTargets] = useState<Record<string, QuickNoteTarget>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicleId || !text.trim()) return
    await createQuickNote(chronicleId, text)
    setText('')
    setMessage('Note saved.')
  }

  async function convert(id: string) {
    const target = targets[id] ?? 'journal'
    try {
      const result = await convertQuickNote(id, target)
      const label = QUICK_NOTE_TARGETS.find((t) => t.value === result.target)?.label ?? result.target
      setMessage(`Converted to ${label}. The note is kept as a record of the conversion.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Conversion failed.')
    }
  }

  if (!activeChronicle) {
    return (
      <EmptyState title="No chronicle yet">
        <p>Start a chronicle first — quick notes are kept with the chronicle they belong to.</p>
      </EmptyState>
    )
  }

  return (
    <section aria-labelledby="quick-notes-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
      <h2 id="quick-notes-heading" className="font-serif text-xl font-semibold">Quick notes</h2>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
        Temporary notes, caught before they fade. Convert one into a journal draft, a memory, a person, a place,
        or a story thread when it turns into something.
      </p>

      <form onSubmit={(e) => void addNote(e)} className="mt-4 space-y-3">
        <Field label="New quick note" htmlFor="quick-note-text">
          <Textarea
            id="quick-note-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A sentence to keep for later…"
            rows={2}
            style={editorStyle}
          />
        </Field>
        <Button type="submit" disabled={!text.trim()}>
          Save note
        </Button>
      </form>

      {message && (
        <p role="status" className="mt-3 text-sm text-ink-soft dark:text-parchment/70">
          {message}
        </p>
      )}

      <ul className="mt-5 space-y-3">
        {(notes ?? []).map((note) => {
          const label = convertedLabel(note.convertedTo)
          const link = convertedLink(note.convertedTo)
          return (
            <li key={note.id} className="rounded-md border border-ink/10 bg-white/40 p-3 dark:border-parchment/10 dark:bg-charcoal-panel/40">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.text}</p>
              <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">{formatRelativeTime(note.createdAt)}</p>
              {label ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="gold">Converted to {label}</Badge>
                  {link && (
                    <Link to={link.to} className="text-oxblood underline dark:text-gold-light">
                      {link.label}
                    </Link>
                  )}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label="Convert to…" htmlFor={`convert-${note.id}`}>
                    <Select
                      id={`convert-${note.id}`}
                      value={targets[note.id] ?? 'journal'}
                      onChange={(e) => setTargets((t) => ({ ...t, [note.id]: e.target.value as QuickNoteTarget }))}
                      className="w-56"
                    >
                      {QUICK_NOTE_TARGETS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button size="sm" variant="outline" onClick={() => void convert(note.id)}>
                    Convert
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletingId(note.id)}>
                    Delete
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {(notes ?? []).length === 0 && (
        <p className="mt-4 text-sm text-ink-soft dark:text-parchment/70">No quick notes yet.</p>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) void deleteQuickNote(deletingId).then(() => setMessage('Note deleted.'))
        }}
        title="Delete this note?"
        confirmLabel="Delete note"
      >
        <p>Quick notes are temporary by design — deleting one cannot be undone. Convert it first if it matters.</p>
      </ConfirmDialog>
    </section>
  )
}
