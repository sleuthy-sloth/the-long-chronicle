// Character page (Stream A): the vampire's identity, skills, resources,
// conditions / traits / compulsions, and the full change history.
//
// Every skill/resource edit writes a CharacterStateChange in the same Dexie
// transaction as the edit itself, so the history can never disagree with the
// sheet. Conditions, traits and compulsions are themselves state-change
// records (kind 'condition' | 'trait' | 'other') — there is no separate
// "current conditions" table to drift. The self-description is the one
// exception: it is a living field, kept as a single upserted record
// (kind 'other', field 'selfDescription') rather than a new history row on
// every keystroke.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  addResource,
  addSkill,
  addStateEntry,
  db,
  deleteResource,
  deleteSkill,
  deleteStateChange,
  listResources,
  listSkills,
  listStateChanges,
  updateChronicle,
  updateResource,
  updateSkill,
} from '../db/database'
import type { CharacterStateChange, JournalEntry, Resource, Skill } from '../db/types'
import { useAppStore, useAutosave } from '../state/store'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import { createCharacterSnapshot } from '../lib/snapshots'
import TimeJumpDialog from '../components/TimeJumpDialog'

const KIND_LABEL: Record<CharacterStateChange['kind'], string> = {
  skill: 'Skill',
  resource: 'Resource',
  condition: 'Condition',
  trait: 'Trait',
  other: 'Note',
}

function SkillForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Skill
  onSave: (input: { name: string; value?: string; description?: string; notes?: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [value, setValue] = useState(initial?.value ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (!name.trim()) {
          setError('A name is required.')
          return
        }
        void onSave({ name, value: value || undefined, description: description || undefined, notes: notes || undefined }).then(onCancel).catch((err) => setError(err instanceof Error ? err.message : 'Could not save.'))
      }}
    >
      <Field label="Name" error={error}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glassblowing" required />
      </Field>
      <Field label="Value (optional)" hint="Free text — a rating, a phrase, whatever the table uses.">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Master, or 3" />
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>
      <Field label="Notes (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{initial ? 'Save changes' : 'Add skill'}</Button>
      </div>
    </form>
  )
}

function ResourceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Resource
  onSave: (input: { name: string; quantity?: string; description?: string; notes?: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [quantity, setQuantity] = useState(initial?.quantity ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (!name.trim()) {
          setError('A name is required.')
          return
        }
        void onSave({ name, quantity: quantity || undefined, description: description || undefined, notes: notes || undefined }).then(onCancel).catch((err) => setError(err instanceof Error ? err.message : 'Could not save.'))
      }}
    >
      <Field label="Name" error={error}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The glassworks" required />
      </Field>
      <Field label="Quantity (optional)" hint="Free text — a count, an amount, a phrase.">
        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. One workshop, or 12" />
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>
      <Field label="Notes (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{initial ? 'Save changes' : 'Add resource'}</Button>
      </div>
    </form>
  )
}

export default function Character() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const [skills, setSkills] = useState<Skill[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [history, setHistory] = useState<CharacterStateChange[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Identity form state (autosaved to the chronicle).
  const [vampireName, setVampireName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [currentAge, setCurrentAge] = useState('')
  const [currentEra, setCurrentEra] = useState('')
  const [currentLocation, setCurrentLocation] = useState('')
  const [concept, setConcept] = useState('')
  const [tension, setTension] = useState('')
  const [selfDescription, setSelfDescription] = useState('')
  const [identityReady, setIdentityReady] = useState(false)

  const [showSkillForm, setShowSkillForm] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [showResourceForm, setShowResourceForm] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [deleting, setDeleting] = useState<{ kind: 'skill' | 'resource' | 'state'; id: string; label: string } | null>(null)
  const [showTimeJump, setShowTimeJump] = useState(false)
  const navigate = useNavigate()

  // State-entry form (conditions / traits / compulsions).
  const [entryKind, setEntryKind] = useState<'condition' | 'trait' | 'other'>('condition')
  const [entryField, setEntryField] = useState('')
  const [entryValue, setEntryValue] = useState('')
  const [entryJournalId, setEntryJournalId] = useState('')

  const chronicleId = activeChronicle?.id

  async function reload() {
    if (!chronicleId) {
      setLoading(false)
      return
    }
    const [s, r, h, es, selfDesc] = await Promise.all([
      listSkills(chronicleId),
      listResources(chronicleId),
      listStateChanges(chronicleId),
      db.journalEntries.where('chronicleId').equals(chronicleId).toArray(),
      db.characterStateChanges.where('chronicleId').equals(chronicleId).filter((c) => c.kind === 'other' && c.field === 'selfDescription').first(),
    ])
    setSkills(s)
    setResources(r)
    setHistory(h)
    setEntries(es.sort((a, b) => a.number - b.number))
    setSelfDescription(selfDesc?.newValue ?? '')
    setLoading(false)
  }

  // Seed the identity form when the active chronicle changes.
  useEffect(() => {
    if (!activeChronicle) {
      setIdentityReady(false)
      setLoading(false)
      return
    }
    setVampireName(activeChronicle.vampireName)
    setPronouns(activeChronicle.pronouns ?? '')
    setCurrentAge(String(activeChronicle.currentAge))
    setCurrentEra(activeChronicle.currentEra)
    setCurrentLocation(activeChronicle.currentLocation)
    setConcept(activeChronicle.concept)
    setTension(activeChronicle.tension ?? '')
    setIdentityReady(true)
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChronicle?.id])

  // Autosave identity (not the self-description — that has its own record).
  useAutosave(
    identityReady
      ? { vampireName, pronouns, currentAge, currentEra, currentLocation, concept, tension }
      : null,
    async (value) => {
      if (!value || !chronicleId) return
      const age = Number(value.currentAge)
      if (!value.vampireName.trim() || !value.currentEra.trim() || !value.currentLocation.trim()) return
      if (!Number.isInteger(age) || age < 0) return
      await updateChronicle(chronicleId, {
        vampireName: value.vampireName.trim(),
        pronouns: value.pronouns.trim() || undefined,
        currentAge: age,
        currentEra: value.currentEra.trim(),
        currentLocation: value.currentLocation.trim(),
        concept: value.concept.trim(),
        tension: value.tension.trim() || undefined,
      })
      await refreshChronicles()
    },
  )

  // Autosave the self-description into its single upserted record.
  useAutosave(
    identityReady ? { selfDescription } : null,
    async (value) => {
      if (!value || !chronicleId) return
      const existing = await db.characterStateChanges
        .where('chronicleId')
        .equals(chronicleId)
        .filter((c) => c.kind === 'other' && c.field === 'selfDescription')
        .first()
      const text = value.selfDescription.trim()
      if (existing) {
        if ((existing.newValue ?? '') === text) return
        await db.characterStateChanges.put({ ...existing, newValue: text || undefined, updatedAt: new Date().toISOString() })
      } else if (text) {
        await addStateEntry(chronicleId, { kind: 'other', field: 'selfDescription', newValue: text })
      }
    },
  )

  async function addEntry(e: FormEvent) {
    e.preventDefault()
    if (!chronicleId || !entryField.trim()) return
    await addStateEntry(chronicleId, {
      kind: entryKind,
      field: entryField,
      newValue: entryValue || undefined,
      journalEntryId: entryJournalId || null,
    })
    setEntryField('')
    setEntryValue('')
    setEntryJournalId('')
    await reload()
  }

  // Time-jump records are history, not conditions — keep them out of the
  // conditions/traits list (they still show in the full change history).
  const stateEntries = history.filter((h) => h.kind === 'condition' || h.kind === 'trait' || (h.kind === 'other' && h.field !== 'selfDescription' && h.field !== 'timeJump'))

  if (!activeChronicle) {
    return (
      <div>
        <h1 className="mb-5 font-serif text-3xl font-bold">Current Character</h1>
        <EmptyState
          title="No chronicle yet"
          action={<Link to="/chronicles" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Chronicles</Link>}
        >
          <p>Create a chronicle first — the character sheet belongs to a vampire, and there is no vampire yet.</p>
        </EmptyState>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-serif text-3xl font-bold">Current Character</h1>
        <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
          {activeChronicle.title} — changes save automatically as you type, and every skill or resource edit is
          written to the history below.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTimeJump(true)}>
            Time jump — centuries pass…
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!chronicleId) return
              void createCharacterSnapshot(chronicleId, { era: activeChronicle.currentEra, sourceKind: 'manual' }).then(() => {
                navigate('/snapshots')
              })
            }}
          >
            Snapshot now
          </Button>
          <Link to="/snapshots" className="text-sm text-oxblood underline dark:text-gold-light">
            View snapshots →
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-soft dark:text-parchment/70">Loading the character sheet…</p>
      ) : (
        <div className="space-y-8">
          {/* Identity */}
          <section aria-labelledby="identity-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-5 dark:border-parchment/15 dark:bg-charcoal-card">
            <h2 id="identity-heading" className="mb-4 font-serif text-xl font-semibold">Identity</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vampire name">
                <Input value={vampireName} onChange={(e) => setVampireName(e.target.value)} />
              </Field>
              <Field label="Pronouns">
                <Input value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="e.g. she/her" />
              </Field>
              <Field label="Current age">
                <Input type="number" min={0} value={currentAge} onChange={(e) => setCurrentAge(e.target.value)} />
              </Field>
              <Field label="Current era">
                <Input value={currentEra} onChange={(e) => setCurrentEra(e.target.value)} />
              </Field>
              <Field label="Current location">
                <Input value={currentLocation} onChange={(e) => setCurrentLocation(e.target.value)} />
              </Field>
              <Field label="Tension">
                <Input value={tension} onChange={(e) => setTension(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Concept">
                <Textarea value={concept} onChange={(e) => setConcept(e.target.value)} rows={2} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Self-description" hint="How the vampire sees themself, in their own words. Saved to the record, not the change history.">
                <Textarea value={selfDescription} onChange={(e) => setSelfDescription(e.target.value)} rows={3} />
              </Field>
            </div>
            <p className="mt-3 text-xs text-ink-faint dark:text-parchment/50">
              Started at age {activeChronicle.startingAge} in {activeChronicle.startingEra}, {activeChronicle.startingLocation}.
            </p>
          </section>

          {/* Skills */}
          <section aria-labelledby="skills-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="skills-heading" className="font-serif text-xl font-semibold">Skills</h2>
              <Button size="sm" variant="outline" onClick={() => setShowSkillForm(true)}>
                + Add skill
              </Button>
            </div>
            {skills.length === 0 ? (
              <EmptyState title="No skills recorded">
                <p>Skills are whatever the vampire has learned to do across the centuries — crafts, languages, ways of moving through the world.</p>
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {skills.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {s.name}
                        {s.value && <span className="ml-2 text-sm font-normal text-ink-soft dark:text-parchment/70">— {s.value}</span>}
                      </p>
                      {s.description && <p className="mt-1 text-sm leading-relaxed text-ink-soft dark:text-parchment/80">{s.description}</p>}
                      {s.notes && <p className="mt-1 text-xs italic text-ink-faint dark:text-parchment/60">{s.notes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingSkill(s)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting({ kind: 'skill', id: s.id, label: s.name })}>
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Resources */}
          <section aria-labelledby="resources-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="resources-heading" className="font-serif text-xl font-semibold">Resources</h2>
              <Button size="sm" variant="outline" onClick={() => setShowResourceForm(true)}>
                + Add resource
              </Button>
            </div>
            {resources.length === 0 ? (
              <EmptyState title="No resources recorded">
                <p>Wealth, holdings, allies, refuges — whatever the vampire can draw on.</p>
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {resources.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.name}
                        {r.quantity && <span className="ml-2 text-sm font-normal text-ink-soft dark:text-parchment/70">— {r.quantity}</span>}
                      </p>
                      {r.description && <p className="mt-1 text-sm leading-relaxed text-ink-soft dark:text-parchment/80">{r.description}</p>}
                      {r.notes && <p className="mt-1 text-xs italic text-ink-faint dark:text-parchment/60">{r.notes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingResource(r)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting({ kind: 'resource', id: r.id, label: r.name })}>
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Conditions / traits / compulsions */}
          <section aria-labelledby="state-heading">
            <h2 id="state-heading" className="mb-3 font-serif text-xl font-semibold">Conditions, traits &amp; compulsions</h2>
            <form onSubmit={addEntry} className="mb-3 space-y-3 rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
              <div className="grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end">
                <Field label="Kind">
                  <Select value={entryKind} onChange={(e) => setEntryKind(e.target.value as 'condition' | 'trait' | 'other')}>
                    <option value="condition">Condition</option>
                    <option value="trait">Trait</option>
                    <option value="other">Compulsion / other</option>
                  </Select>
                </Field>
                <Field label="Name">
                  <Input value={entryField} onChange={(e) => setEntryField(e.target.value)} placeholder="e.g. Sunlight sensitivity" required />
                </Field>
                <Field label="Detail (optional)">
                  <Input value={entryValue} onChange={(e) => setEntryValue(e.target.value)} placeholder="What it means in play" />
                </Field>
                <Button type="submit">Add</Button>
              </div>
              {entries.length > 0 && (
                <Field label="Linked journal entry (optional)">
                  <Select value={entryJournalId} onChange={(e) => setEntryJournalId(e.target.value)}>
                    <option value="">No link</option>
                    {entries.map((e) => (
                      <option key={e.id} value={e.id}>
                        Entry {e.number} — {e.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </form>
            {stateEntries.length === 0 ? (
              <EmptyState title="Nothing recorded">
                <p>Conditions the vampire carries, traits that define them, compulsions that pull at them — add them as they arise.</p>
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {stateEntries.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <Badge tone="muted">{KIND_LABEL[h.kind]}</Badge> <span className="ml-1">{h.field}</span>
                        {h.newValue && <span className="ml-2 text-sm font-normal text-ink-soft dark:text-parchment/70">— {h.newValue}</span>}
                      </p>
                      {h.journalEntryId && (
                        <p className="mt-1 text-xs">
                          <Link to={`/journal/${h.journalEntryId}`} className="text-oxblood underline dark:text-gold-light">
                            Linked journal entry →
                          </Link>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">{formatRelativeTime(h.createdAt)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting({ kind: 'state', id: h.id, label: h.field })}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Change history */}
          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="mb-3 font-serif text-xl font-semibold">Change history</h2>
            {history.length === 0 ? (
              <EmptyState title="No changes yet">
                <p>Every skill, resource and condition change is recorded here, newest first.</p>
              </EmptyState>
            ) : (
              <ol className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="rounded-lg border border-ink/10 bg-parchment-card/70 p-3 text-sm dark:border-parchment/10 dark:bg-charcoal-card/70">
                    <p>
                      <Badge tone="muted">{KIND_LABEL[h.kind]}</Badge>{' '}
                      <strong>{h.field}</strong>
                      {h.oldValue !== undefined && h.newValue !== undefined ? (
                        <span className="text-ink-soft dark:text-parchment/80">
                          {' '}
                          changed from “{h.oldValue}” to “{h.newValue}”
                        </span>
                      ) : h.newValue !== undefined ? (
                        <span className="text-ink-soft dark:text-parchment/80"> — {h.newValue}</span>
                      ) : h.oldValue !== undefined ? (
                        <span className="text-ink-soft dark:text-parchment/80"> — was “{h.oldValue}”</span>
                      ) : null}
                    </p>
                    {h.note && <p className="mt-1 text-xs italic text-ink-soft dark:text-parchment/70">{h.note}</p>}
                    <p className="mt-1 text-xs text-ink-faint dark:text-parchment/50">
                      {formatRelativeTime(h.createdAt)}
                      {h.journalEntryId && (
                        <>
                          {' · '}
                          <Link to={`/journal/${h.journalEntryId}`} className="text-oxblood underline dark:text-gold-light">
                            journal entry
                          </Link>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      <Modal open={showSkillForm} onClose={() => setShowSkillForm(false)} title="Add a skill">
        <SkillForm
          onSave={async (input) => {
            if (!chronicleId) return
            await addSkill(chronicleId, input)
            await reload()
          }}
          onCancel={() => setShowSkillForm(false)}
        />
      </Modal>
      <Modal open={editingSkill !== null} onClose={() => setEditingSkill(null)} title={`Edit “${editingSkill?.name ?? ''}”`}>
        {editingSkill && (
          <SkillForm
            initial={editingSkill}
            onSave={async (input) => {
              await updateSkill(editingSkill.id, input)
              await reload()
            }}
            onCancel={() => setEditingSkill(null)}
          />
        )}
      </Modal>
      <Modal open={showResourceForm} onClose={() => setShowResourceForm(false)} title="Add a resource">
        <ResourceForm
          onSave={async (input) => {
            if (!chronicleId) return
            await addResource(chronicleId, input)
            await reload()
          }}
          onCancel={() => setShowResourceForm(false)}
        />
      </Modal>
      <Modal open={editingResource !== null} onClose={() => setEditingResource(null)} title={`Edit “${editingResource?.name ?? ''}”`}>
        {editingResource && (
          <ResourceForm
            initial={editingResource}
            onSave={async (input) => {
              await updateResource(editingResource.id, input)
              await reload()
            }}
            onCancel={() => setEditingResource(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          const d = deleting
          void (async () => {
            if (d.kind === 'skill') await deleteSkill(d.id)
            else if (d.kind === 'resource') await deleteResource(d.id)
            else await deleteStateChange(d.id)
            await reload()
          })()
        }}
        title={`Remove “${deleting?.label ?? ''}”?`}
        confirmLabel="Remove"
      >
        <p>
          The entry is removed from the sheet, but the removal itself is written to the change history — the record
          keeps its memory of what was there.
        </p>
      </ConfirmDialog>
      {showTimeJump && (
        <TimeJumpDialog
          open={showTimeJump}
          onClose={() => setShowTimeJump(false)}
          chronicle={activeChronicle}
          createSnapshot={(chronicleId, opts) => createCharacterSnapshot(chronicleId, opts)}
        />
      )}
    </div>
  )
}
