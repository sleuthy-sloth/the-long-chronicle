import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type {
  Chronicle,
  JournalEntry,
  JournalEntryDraft,
  Memory,
  Person,
  Place,
  Resource,
  Skill,
} from '../db/types'
import { newId, nowIso } from '../db/types'
import { renderMarkdown } from '../lib/markdown'
import { editorFontSizeStyle } from '../lib/editorFont'
import { useAppStore } from '../state/store'
import { parseTags, type NewStateChangeInput, type SaveEntryInput } from '../lib/journal'
import AttachmentList from './AttachmentList'

export interface JournalEditorFormProps {
  chronicle: Chronicle
  /** Existing entry when editing; null for a new entry. */
  entry: JournalEntry | null
  draft: JournalEntryDraft | null
  people: Person[]
  places: Place[]
  skills: Skill[]
  resources: Resource[]
  memories: Memory[]
  /** Persist the draft on every autosave. The page writes it to Dexie. */
  onAutosave: (draft: JournalEntryDraft) => Promise<void>
  /** Final save. The page runs the edit guard, assigns codes to inline
   *  memories, and writes entry + state changes in one transaction. */
  onSave: (input: SaveEntryInput) => Promise<void>
  onCancel: () => void
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

interface InlineMemory {
  key: string
  title: string
  text: string
  action: 'add' | 'alter' | 'lose'
}

const inputCls =
  'mt-1 w-full rounded border border-ink/25 bg-white/70 p-2 dark:border-gold/30 dark:bg-charcoal-panel'
const labelCls = 'block text-sm font-semibold'
const stepCls = 'rounded-lg border border-gold/40 bg-parchment-card p-5 dark:border-gold/25 dark:bg-charcoal-card'

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

/**
 * The rendered-Markdown side of Step 3, exported so it can be tested on its
 * own. `style` carries the editor font size (see editorFontSizeStyle), so
 * the preview reads at the same size as the writing area.
 */
export function JournalBodyPreview({ body, style }: { body: string; style?: CSSProperties }) {
  return (
    <div
      className="markdown-body mt-4 min-h-64 whitespace-pre-wrap rounded border border-ink/20 bg-white/50 p-4 dark:bg-charcoal-panel"
      style={style}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || '<p><em>Nothing written yet.</em></p>' }}
    />
  )
}

/**
 * The five-step journal editor, as labelled sections on one page.
 * Step 1 Context · 2 Prompt capture · 3 Write (Markdown, autosave, preview,
 * fullscreen) · 4 Consequences · 5 Review & save.
 * Prompt fields are free text the player enters manually — no prompt tables
 * or rulebook content are bundled here.
 */
export default function JournalEditorForm({
  chronicle,
  entry,
  draft,
  people,
  places,
  skills,
  resources,
  memories,
  onAutosave,
  onSave,
  onCancel,
}: JournalEditorFormProps) {
  const [title, setTitle] = useState(draft?.title ?? entry?.title ?? '')
  const [era, setEra] = useState(draft?.era ?? entry?.era ?? chronicle.currentEra)
  const [age, setAge] = useState<number | undefined>(entry?.age ?? chronicle.currentAge)
  const [location, setLocation] = useState(entry?.location ?? chronicle.currentLocation)
  const [promptText, setPromptText] = useState(draft?.promptText ?? entry?.promptText ?? '')
  const [promptRef, setPromptRef] = useState(draft?.promptRef ?? entry?.promptRef ?? '')
  const [promptSource, setPromptSource] = useState(entry?.promptSource ?? '')
  const [body, setBody] = useState(draft?.body ?? entry?.body ?? '')
  const [choices, setChoices] = useState(entry?.choices ?? '')
  const [consequences, setConsequences] = useState(entry?.consequences ?? '')
  const [longTerm, setLongTerm] = useState(entry?.longTerm ?? '')
  const [tagsRaw, setTagsRaw] = useState((entry?.tags ?? []).join(', '))
  const [privateNotes, setPrivateNotes] = useState(entry?.privateNotes ?? '')
  const [personIds, setPersonIds] = useState<string[]>(entry?.personIds ?? [])
  const [placeIds, setPlaceIds] = useState<string[]>(entry?.placeIds ?? [])
  const [memoryIds, setMemoryIds] = useState<string[]>(entry?.memoryIds ?? [])
  const [stateChanges, setStateChanges] = useState<NewStateChangeInput[]>([])
  const [inlineMemories, setInlineMemories] = useState<InlineMemory[]>([])
  const [newMemoryTitle, setNewMemoryTitle] = useState('')
  const [newMemoryText, setNewMemoryText] = useState('')
  const [newMemoryAction, setNewMemoryAction] = useState<'add' | 'alter' | 'lose'>('add')
  const [newThread, setNewThread] = useState('')
  const [newThreadTitles, setNewThreadTitles] = useState<string[]>([])
  const [preview, setPreview] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Editor font size (Gap C): subscribed from the shared settings store, so
  // changing the setting re-renders this form at the new size — live, with
  // no reload — and it survives reloads because the store loads the
  // persisted value from Dexie on boot. One style object feeds both the
  // writing area and the Markdown preview below.
  const editorFontSize = useAppStore((s) => s.settings.editorFontSize)
  const editorStyle = editorFontSizeStyle(editorFontSize)

  // Skill/resource change builder (Step 4).
  const [changeKind, setChangeKind] = useState<'skill' | 'resource' | 'condition' | 'trait' | 'other'>('skill')
  const [changeRecordId, setChangeRecordId] = useState('')
  const [changeField, setChangeField] = useState('value')
  const [changeOld, setChangeOld] = useState('')
  const [changeNew, setChangeNew] = useState('')
  const [changeNote, setChangeNote] = useState('')

  const draftIdRef = useRef(draft?.id ?? newId())
  const firstAutosave = useRef(true)

  const draftSnapshot: JournalEntryDraft = useMemo(
    () => ({
      id: draftIdRef.current,
      chronicleId: chronicle.id,
      createdAt: draft?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      entryId: entry?.id ?? null,
      title,
      body,
      era,
      promptText,
      promptRef,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, body, era, promptText, promptRef],
  )

  // Autosave with debounce; visible Saving / Saved / Save failed indicator.
  useEffect(() => {
    if (firstAutosave.current) {
      firstAutosave.current = false
      if (!title && !body) return
    }
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      onAutosave(draftSnapshot)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('failed'))
    }, 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSnapshot])

  const saveStatusText: Record<SaveStatus, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    failed: 'Save failed — your text is still in this editor; try again.',
  }

  const changeRecords = changeKind === 'skill' ? skills : changeKind === 'resource' ? resources : []

  function addStateChange() {
    if (!changeNew.trim()) return
    setStateChanges((prev) => [
      ...prev,
      {
        kind: changeKind,
        recordId: changeRecordId || undefined,
        field: changeField,
        oldValue: changeOld || undefined,
        newValue: changeNew.trim(),
        note: changeNote.trim() || undefined,
      },
    ])
    setChangeRecordId('')
    setChangeOld('')
    setChangeNew('')
    setChangeNote('')
  }

  function addInlineMemory() {
    if (!newMemoryTitle.trim() || !newMemoryText.trim()) return
    setInlineMemories((prev) => [
      ...prev,
      { key: newId(), title: newMemoryTitle.trim(), text: newMemoryText.trim(), action: newMemoryAction },
    ])
    setNewMemoryTitle('')
    setNewMemoryText('')
  }

  async function handleSave() {
    if (!title.trim()) {
      setSaveError('Give the entry a title before saving.')
      return
    }
    setSaveError(null)
    setSaving(true)
    const now = nowIso()
    const entryOut: JournalEntry = {
      id: entry?.id ?? newId(),
      chronicleId: chronicle.id,
      createdAt: entry?.createdAt ?? now,
      updatedAt: now,
      number: entry?.number ?? 0, // Page assigns the next number for new entries.
      title: title.trim(),
      era: era.trim() || chronicle.currentEra,
      age,
      location: location.trim() || undefined,
      promptText: promptText.trim() || undefined,
      promptRef: promptRef.trim() || undefined,
      promptSource: promptSource.trim() || undefined,
      body,
      choices: choices.trim() || undefined,
      consequences: consequences.trim() || undefined,
      longTerm: longTerm.trim() || undefined,
      memoryIds: [...memoryIds, ...inlineMemories.filter((m) => m.action === 'add').map((m) => m.key)],
      personIds,
      placeIds,
      threadIds: entry?.threadIds ?? [],
      pinned: entry?.pinned ?? false,
      tags: parseTags(tagsRaw),
      privateNotes: privateNotes.trim() || undefined,
      draft: false,
    }
    // Inline memories are created here as full Memory rows; the page assigns
    // their M-codes before the transaction. 'alter'/'lose' on an existing
    // memory is recorded as a note on the entry, not applied silently here —
    // the player confirms those from the Memories pages.
    const newMemories: Memory[] = inlineMemories
      .filter((m) => m.action === 'add')
      .map((m) => ({
        id: m.key,
        chronicleId: chronicle.id,
        createdAt: now,
        updatedAt: now,
        code: '',
        title: m.title,
        text: m.text,
        status: 'Active' as const,
        tags: [],
        occurredEra: era.trim() || undefined,
        recordedEra: era.trim() || undefined,
        personIds,
        placeIds,
        journalEntryIds: [entryOut.id],
        notes: undefined,
      }))
    try {
      await onSave({
        entry: entryOut,
        stateChanges,
        newMemories,
        newThreadTitles,
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Saving failed.')
    } finally {
      setSaving(false)
    }
  }

  const reviewSummary = [
    { label: 'Title', value: title || '(untitled)' },
    { label: 'Era', value: era },
    { label: 'Location', value: location || '—' },
    { label: 'Prompt', value: promptText ? `${promptRef ? `${promptRef}: ` : ''}${promptText.slice(0, 80)}${promptText.length > 80 ? '…' : ''}` : '—' },
    { label: 'Entry', value: `${body.trim().split(/\s+/).filter(Boolean).length} words` },
    { label: 'Memories linked', value: `${memoryIds.length + inlineMemories.filter((m) => m.action === 'add').length}` },
    { label: 'Character changes', value: `${stateChanges.length}` },
    { label: 'New threads', value: `${newThreadTitles.length}` },
  ]

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleSave()
      }}
      className="space-y-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm font-semibold" role="status">
          {saveStatus === 'idle' ? 'Draft autosaves as you write.' : saveStatusText[saveStatus]}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : entry ? 'Save entry' : 'Save new entry'}
          </button>
        </div>
      </div>
      {saveError && (
        <p role="alert" className="rounded border border-oxblood bg-oxblood/10 p-3 text-sm font-semibold text-oxblood">
          {saveError}
        </p>
      )}

      {/* Step 1 — Context */}
      <section aria-labelledby="step-1" className={stepCls}>
        <h2 id="step-1" className="font-serif text-2xl">Step 1 — Context</h2>
        <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
          Pre-filled from {chronicle.vampireName}’s chronicle; edit anything that has changed.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="entry-title" className={labelCls}>Title</label>
            <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label htmlFor="entry-era" className={labelCls}>Date / era</label>
            <input id="entry-era" value={era} onChange={(e) => setEra(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="entry-age" className={labelCls}>Age</label>
            <input
              id="entry-age"
              type="number"
              value={age ?? ''}
              onChange={(e) => setAge(e.target.value === '' ? undefined : Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="entry-location" className={labelCls}>Location</label>
            <input id="entry-location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
          </div>
        </div>
      </section>

      {/* Step 2 — Prompt capture */}
      <section aria-labelledby="step-2" className={stepCls}>
        <h2 id="step-2" className="font-serif text-2xl">Step 2 — Prompt capture</h2>
        <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
          Write down the prompt you played from, in your own words. No prompts are supplied here — you enter them yourself.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="entry-prompt" className={labelCls}>Prompt (free text)</label>
            <textarea id="entry-prompt" value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={3} className={inputCls} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="entry-prompt-ref" className={labelCls}>Prompt number / reference</label>
              <input id="entry-prompt-ref" value={promptRef} onChange={(e) => setPromptRef(e.target.value)} placeholder="e.g. Prompt 12" className={inputCls} />
            </div>
            <div>
              <label htmlFor="entry-prompt-source" className={labelCls}>Source note</label>
              <input id="entry-prompt-source" value={promptSource} onChange={(e) => setPromptSource(e.target.value)} placeholder="Where this prompt came from" className={inputCls} />
            </div>
          </div>
        </div>
      </section>

      {/* Step 3 — Write */}
      <section aria-labelledby="step-3" className={fullscreen ? 'fixed inset-0 z-40 overflow-y-auto bg-parchment p-6 dark:bg-charcoal' : stepCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="step-3" className="font-serif text-2xl">Step 3 — Write</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              aria-pressed={preview}
              className="rounded border border-ink/30 px-3 py-1.5 text-sm font-semibold"
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              aria-pressed={fullscreen}
              className="rounded border border-ink/30 px-3 py-1.5 text-sm font-semibold"
            >
              {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
          </div>
        </div>
        {preview ? (
          <JournalBodyPreview body={body} style={editorStyle} />
        ) : (
          <textarea
            aria-label="Journal entry body (Markdown supported)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={fullscreen ? 24 : 14}
            placeholder="Write the entry… Markdown headings, bold, italic, lists and quotes are supported."
            style={editorStyle}
            className={`${inputCls} mt-4 leading-relaxed`}
          />
        )}
        <p className="mt-2 text-xs text-ink-faint dark:text-parchment/60">
          Markdown supported: # headings, **bold**, *italic*, lists, &gt; quotes, [links](https://…).
        </p>
        <div className="mt-4">
          <label htmlFor="entry-tags" className={labelCls}>Tags (comma-separated)</label>
          <input id="entry-tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className={inputCls} />
        </div>
        <div className="mt-4">
          <label htmlFor="entry-private-notes" className={labelCls}>Private notes (not part of the entry)</label>
          <textarea id="entry-private-notes" value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} rows={2} className={inputCls} />
        </div>
      </section>

      {/* Step 4 — Consequences */}
      <section aria-labelledby="step-4" className={stepCls}>
        <h2 id="step-4" className="font-serif text-2xl">Step 4 — Consequences</h2>

        <h3 className="mt-5 font-serif text-lg">Choices &amp; consequences</h3>
        <div className="mt-2 space-y-4">
          <div>
            <label htmlFor="entry-choices" className={labelCls}>Choices made</label>
            <textarea id="entry-choices" value={choices} onChange={(e) => setChoices(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label htmlFor="entry-consequences" className={labelCls}>Immediate consequences</label>
            <textarea id="entry-consequences" value={consequences} onChange={(e) => setConsequences(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label htmlFor="entry-longterm" className={labelCls}>Long-term consequences</label>
            <textarea id="entry-longterm" value={longTerm} onChange={(e) => setLongTerm(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        <h3 className="mt-6 font-serif text-lg">Memories</h3>
        <fieldset className="mt-2">
          <legend className="text-sm font-semibold">Link existing memories</legend>
          {memories.length === 0 ? (
            <p className="mt-1 text-sm text-ink-faint">No memories recorded yet.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {memories.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 rounded border border-ink/25 px-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={memoryIds.includes(m.id)}
                    onChange={() => setMemoryIds((prev) => toggleId(prev, m.id))}
                  />
                  {m.code} — {m.title}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="mt-4 rounded border border-ink/20 p-3">
          <p className="text-sm font-semibold">Create a new memory inline</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <input
              aria-label="New memory title"
              value={newMemoryTitle}
              onChange={(e) => setNewMemoryTitle(e.target.value)}
              placeholder="Memory title"
              className={inputCls}
            />
            <input
              aria-label="New memory text"
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              placeholder="What is remembered…"
              className={inputCls}
            />
            <div className="flex gap-2">
              <select
                aria-label="Memory action"
                value={newMemoryAction}
                onChange={(e) => setNewMemoryAction(e.target.value as 'add' | 'alter' | 'lose')}
                className="rounded border border-ink/25 bg-white/70 p-2 text-sm dark:border-gold/30 dark:bg-charcoal-panel"
              >
                <option value="add">Add</option>
                <option value="alter">Alter existing</option>
                <option value="lose">Lose existing</option>
              </select>
              <button type="button" onClick={addInlineMemory} className="rounded border border-ink/30 px-3 py-1.5 text-sm font-semibold">
                Add
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            “Alter” and “Lose” are recorded here as intent on the entry; apply them from the Memories page so the version history is written properly.
          </p>
          {inlineMemories.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {inlineMemories.map((m) => (
                <li key={m.key} className="flex items-center justify-between gap-2">
                  <span>
                    <strong>{m.action === 'add' ? 'Add' : m.action === 'alter' ? 'Alter' : 'Lose'}:</strong> {m.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setInlineMemories((prev) => prev.filter((x) => x.key !== m.key))}
                    className="text-sm text-oxblood underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <h3 className="mt-6 font-serif text-lg">Skills &amp; resources</h3>
        <p className="text-sm text-ink-soft dark:text-parchment/80">
          Record what changed about the character. Each change is saved with the entry as a character state change.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="change-kind" className={labelCls}>Kind</label>
            <select
              id="change-kind"
              value={changeKind}
              onChange={(e) => {
                setChangeKind(e.target.value as typeof changeKind)
                setChangeRecordId('')
                setChangeOld('')
              }}
              className={inputCls}
            >
              <option value="skill">Skill</option>
              <option value="resource">Resource</option>
              <option value="condition">Condition</option>
              <option value="trait">Trait</option>
              <option value="other">Other</option>
            </select>
          </div>
          {(changeKind === 'skill' || changeKind === 'resource') && (
            <div>
              <label htmlFor="change-record" className={labelCls}>{changeKind === 'skill' ? 'Skill' : 'Resource'}</label>
              <select
                id="change-record"
                value={changeRecordId}
                onChange={(e) => {
                  setChangeRecordId(e.target.value)
                  const rec = changeRecords.find((r) => r.id === e.target.value)
                  setChangeOld(
                    rec
                      ? 'value' in rec
                        ? (rec.value ?? rec.description ?? '')
                        : 'quantity' in rec
                          ? (rec.quantity ?? rec.description ?? '')
                          : (rec.description ?? '')
                      : '',
                  )
                }}
                className={inputCls}
              >
                <option value="">— new / unlisted —</option>
                {changeRecords.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="change-field" className={labelCls}>Field changed</label>
            <input id="change-field" value={changeField} onChange={(e) => setChangeField(e.target.value)} placeholder="e.g. value, quantity, notes" className={inputCls} />
          </div>
          <div>
            <label htmlFor="change-new" className={labelCls}>New value</label>
            <input id="change-new" value={changeNew} onChange={(e) => setChangeNew(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="change-old" className={labelCls}>Old value (if any)</label>
            <input id="change-old" value={changeOld} onChange={(e) => setChangeOld(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="change-note" className={labelCls}>Note</label>
            <input id="change-note" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button type="button" onClick={addStateChange} disabled={!changeNew.trim()} className="mt-3 rounded border border-ink/30 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          Record change
        </button>
        {stateChanges.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {stateChanges.map((c, idx) => (
              <li key={idx} className="flex items-center justify-between gap-2">
                <span>
                  <strong>{c.kind}</strong> · {c.field}: {c.oldValue ? `${c.oldValue} → ` : ''}{c.newValue}
                  {c.note ? ` (${c.note})` : ''}
                </span>
                <button type="button" onClick={() => setStateChanges((prev) => prev.filter((_, i) => i !== idx))} className="text-sm text-oxblood underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-6 font-serif text-lg">People &amp; places</h3>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-semibold">People in this entry</legend>
            {people.length === 0 ? (
              <p className="mt-1 text-sm text-ink-faint">No people recorded yet.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={personIds.includes(p.id)} onChange={() => setPersonIds((prev) => toggleId(prev, p.id))} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Places in this entry</legend>
            {places.length === 0 ? (
              <p className="mt-1 text-sm text-ink-faint">No places recorded yet.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {places.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={placeIds.includes(p.id)} onChange={() => setPlaceIds((prev) => toggleId(prev, p.id))} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>

        <h3 className="mt-6 font-serif text-lg">Unresolved threads</h3>
        <div className="mt-2 flex gap-2">
          <input
            aria-label="New unresolved thread"
            value={newThread}
            onChange={(e) => setNewThread(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (newThread.trim()) {
                  setNewThreadTitles((prev) => [...prev, newThread.trim()])
                  setNewThread('')
                }
              }
            }}
            placeholder="e.g. Who left the door open at the mill?"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => {
              if (newThread.trim()) {
                setNewThreadTitles((prev) => [...prev, newThread.trim()])
                setNewThread('')
              }
            }}
            className="shrink-0 rounded border border-ink/30 px-3 py-1.5 text-sm font-semibold"
          >
            Add thread
          </button>
        </div>
        {newThreadTitles.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {newThreadTitles.map((t, idx) => (
              <li key={idx} className="flex items-center justify-between gap-2">
                <span>{t}</span>
                <button type="button" onClick={() => setNewThreadTitles((prev) => prev.filter((_, i) => i !== idx))} className="text-sm text-oxblood underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Step 5 — Review */}
      <section aria-labelledby="step-5" className={stepCls}>
        <h2 id="step-5" className="font-serif text-2xl">Step 5 — Review &amp; save</h2>
        <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
          Everything below is saved together in one transaction: the entry, its character changes, new memories and new threads.
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {reviewSummary.map((row) => (
            <div key={row.label} className="flex gap-2 text-sm">
              <dt className="font-semibold">{row.label}:</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={saving} className="rounded bg-oxblood px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Confirm & save entry'}
          </button>
          <button type="button" onClick={onCancel} className="rounded border border-ink/30 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
        </div>
      </section>

      {entry && (
        <AttachmentList chronicleId={chronicle.id} recordType="journalEntry" recordId={entry.id} />
      )}
    </form>
  )
}
