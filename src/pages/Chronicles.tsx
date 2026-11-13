// Chronicles page (Stream A): create / rename / duplicate / archive /
// restore / delete. Deleting offers an export first — there is no server
// copy, so a deleted chronicle is gone for good.
//
// Archiving is a status, not a separate store: Completed chronicles are the
// archive (see the Archive page); restoring returns one to In Progress.
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  archiveChronicle,
  createChronicle,
  deleteChronicle,
  duplicateChronicle,
  restoreChronicle,
  updateChronicle,
  type NewChronicleInput,
} from '../db/database'
import type { Chronicle, ChronicleStatus } from '../db/types'
import { useAppStore } from '../state/store'
import { downloadJsonBackup, getDb } from '../lib/export'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'

const STATUSES: ChronicleStatus[] = ['In Progress', 'Paused', 'Completed']

const STATUS_TONE: Record<ChronicleStatus, 'gold' | 'muted' | 'oxblood'> = {
  'In Progress': 'gold',
  Paused: 'muted',
  Completed: 'oxblood',
}

export function CreateChronicleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const [title, setTitle] = useState('')
  const [vampireName, setVampireName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [startingAge, setStartingAge] = useState('25')
  const [startingEra, setStartingEra] = useState('')
  const [startingLocation, setStartingLocation] = useState('')
  const [concept, setConcept] = useState('')
  const [tension, setTension] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setTitle('')
    setVampireName('')
    setPronouns('')
    setStartingAge('25')
    setStartingEra('')
    setStartingLocation('')
    setConcept('')
    setTension('')
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const age = Number(startingAge)
    if (!title.trim() || !vampireName.trim() || !startingEra.trim() || !startingLocation.trim()) {
      setError('Title, vampire name, starting era and starting location are required.')
      return
    }
    if (!Number.isInteger(age) || age < 0) {
      setError('Starting age must be a whole number, 0 or more.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const input: NewChronicleInput = {
        title,
        vampireName,
        pronouns: pronouns || undefined,
        startingAge: age,
        startingEra,
        startingLocation,
        concept,
        tension: tension || undefined,
      }
      await createChronicle(input)
      await refreshChronicles()
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the chronicle.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Begin a new chronicle" wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-soft dark:text-parchment/70">
          A chronicle is one vampire&rsquo;s thousand years. Nothing here is sent anywhere — it lives only in this
          browser until you export it.
        </p>
        <Field label="Chronicle title" error={error}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Venice Years" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vampire name">
            <Input value={vampireName} onChange={(e) => setVampireName(e.target.value)} placeholder="Who is the vampire?" required />
          </Field>
          <Field label="Pronouns (optional)">
            <Input value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="e.g. she/her" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starting age" hint="Age when the record begins.">
            <Input type="number" min={0} value={startingAge} onChange={(e) => setStartingAge(e.target.value)} required />
          </Field>
          <Field label="Starting era" hint="Free text — e.g. “late 14th century”.">
            <Input value={startingEra} onChange={(e) => setStartingEra(e.target.value)} placeholder="late 14th century" required />
          </Field>
          <Field label="Starting location">
            <Input value={startingLocation} onChange={(e) => setStartingLocation(e.target.value)} placeholder="Venice" required />
          </Field>
        </div>
        <Field label="Concept" hint="A line or two about who this vampire is.">
          <Textarea value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="A glassblower's apprentice who never left the lagoon…" rows={3} />
        </Field>
        <Field label="Tension (optional)" hint="What pulls against the vampire — the thread to watch.">
          <Input value={tension} onChange={(e) => setTension(e.target.value)} placeholder="e.g. The old family still hunts her" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create chronicle'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditChronicleDialog({ chronicle, onClose }: { chronicle: Chronicle; onClose: () => void }) {
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const [title, setTitle] = useState(chronicle.title)
  const [vampireName, setVampireName] = useState(chronicle.vampireName)
  const [pronouns, setPronouns] = useState(chronicle.pronouns ?? '')
  const [currentAge, setCurrentAge] = useState(String(chronicle.currentAge))
  const [currentEra, setCurrentEra] = useState(chronicle.currentEra)
  const [currentLocation, setCurrentLocation] = useState(chronicle.currentLocation)
  const [concept, setConcept] = useState(chronicle.concept)
  const [tension, setTension] = useState(chronicle.tension ?? '')
  const [status, setStatus] = useState<ChronicleStatus>(chronicle.status)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const age = Number(currentAge)
    if (!Number.isInteger(age) || age < 0) {
      setError('Current age must be a whole number, 0 or more.')
      return
    }
    setSaving(true)
    try {
      await updateChronicle(chronicle.id, {
        title: title.trim(),
        vampireName: vampireName.trim(),
        pronouns: pronouns.trim() || undefined,
        currentAge: age,
        currentEra: currentEra.trim(),
        currentLocation: currentLocation.trim(),
        concept: concept.trim(),
        tension: tension.trim() || undefined,
        status,
      })
      await refreshChronicles()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the chronicle.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit “${chronicle.title}”`} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Chronicle title" error={error}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vampire name">
            <Input value={vampireName} onChange={(e) => setVampireName(e.target.value)} required />
          </Field>
          <Field label="Pronouns (optional)">
            <Input value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current age">
            <Input type="number" min={0} value={currentAge} onChange={(e) => setCurrentAge(e.target.value)} required />
          </Field>
          <Field label="Current era">
            <Input value={currentEra} onChange={(e) => setCurrentEra(e.target.value)} required />
          </Field>
          <Field label="Current location">
            <Input value={currentLocation} onChange={(e) => setCurrentLocation(e.target.value)} required />
          </Field>
        </div>
        <Field label="Concept">
          <Textarea value={concept} onChange={(e) => setConcept(e.target.value)} rows={3} />
        </Field>
        <Field label="Tension (optional)">
          <Input value={tension} onChange={(e) => setTension(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ChronicleStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Chronicles() {
  const chronicles = useAppStore((s) => s.chronicles)
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const setActiveChronicle = useAppStore((s) => s.setActiveChronicle)
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Chronicle | null>(null)
  const [deleting, setDeleting] = useState<Chronicle | null>(null)
  const [statusFilter, setStatusFilter] = useState<ChronicleStatus | 'All'>('All')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    void refreshChronicles()
  }, [refreshChronicles])

  const visible = statusFilter === 'All' ? chronicles : chronicles.filter((c) => c.status === statusFilter)

  async function run(id: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusyId(id)
    try {
      await fn()
      await refreshChronicles()
      after?.()
    } finally {
      setBusyId(null)
    }
  }

  async function exportFirst(c: Chronicle) {
    try {
      await downloadJsonBackup(getDb(), c.id)
      setNotice(`Backup of “${c.title}” downloaded. You can delete it now — the file is your copy.`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Export failed.')
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">Chronicles</h1>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
            One chronicle per vampire. The active chronicle is the one the Dashboard, Journal and Memories work in.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New chronicle</Button>
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-md bg-gold/15 px-3 py-2 text-sm text-ink dark:bg-gold/20 dark:text-parchment">
          {notice}
        </p>
      )}

      <div className="mb-4 flex gap-2" role="group" aria-label="Filter by status">
        {(['All', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            aria-pressed={statusFilter === s}
            className={`rounded-full px-3 py-1 text-sm ${statusFilter === s ? 'bg-oxblood font-medium text-white' : 'bg-ink/5 text-ink-soft hover:bg-ink/10 dark:bg-parchment/10 dark:text-parchment/80'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {chronicles.length === 0 ? (
        <EmptyState
          title="No chronicles yet"
          action={<Button onClick={() => setShowCreate(true)}>Create your first chronicle</Button>}
        >
          <p>Every vampire&rsquo;s thousand years begins with a name, an era, and a place. Nothing is seeded for you — the record starts empty, as it should.</p>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title={`No ${statusFilter.toLowerCase()} chronicles`}>
          <p>Try a different status filter, or start a new chronicle.</p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) => {
            const isActive = activeChronicle?.id === c.id
            const busy = busyId === c.id
            return (
              <li
                key={c.id}
                className={`rounded-lg border p-4 ${isActive ? 'border-gold bg-parchment-card dark:bg-charcoal-card' : 'border-ink/15 bg-parchment-card/70 dark:border-parchment/15 dark:bg-charcoal-card/70'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-xl font-semibold">{c.title}</h2>
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                      {isActive && <Badge tone="gold">Active</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
                      {c.vampireName}
                      {c.pronouns ? ` (${c.pronouns})` : ''} · age {c.currentAge} · {c.currentEra} · {c.currentLocation}
                    </p>
                    {c.concept && <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-parchment/80">{c.concept}</p>}
                    {c.tension && <p className="mt-1 text-sm italic text-ink-soft dark:text-parchment/70">Tension: {c.tension}</p>}
                    <p className="mt-2 text-xs text-ink-faint dark:text-parchment/50">
                      Began {c.startingEra} in {c.startingLocation} · updated {formatRelativeTime(c.updatedAt)}
                      {c.lastExportAt ? ` · last backed up ${formatRelativeTime(c.lastExportAt)}` : ' · never backed up'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!isActive && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void setActiveChronicle(c.id)}>
                        Make active
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(c.id, () => duplicateChronicle(c.id))}>
                      Duplicate
                    </Button>
                    {c.status === 'Completed' ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(c.id, () => restoreChronicle(c.id))}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(c.id, () => archiveChronicle(c.id))}>
                        Archive
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => setDeleting(c)}>
                      Delete…
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <CreateChronicleDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {editing && <EditChronicleDialog chronicle={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          const c = deleting
          void run(c.id, () => deleteChronicle(c.id), () => navigate('/chronicles'))
        }}
        title={`Delete “${deleting?.title ?? ''}”?`}
        confirmLabel="Delete forever"
      >
        <p>
          This deletes the chronicle and <strong>everything in it</strong> — journal entries, memories, people,
          places, and the character record. There is no server copy and no undo.
        </p>
        <p>
          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              if (deleting) void exportFirst(deleting)
            }}
          >
            Export a backup first
          </Button>
        </p>
      </ConfirmDialog>
    </div>
  )
}
