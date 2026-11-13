// Archive (Streams A + C).
//
// Stream A: completed chronicles. Archiving is a status — a chronicle is
// "archived" when its status is Completed — so the completed list below,
// with restore, duplicate and delete, is the archive.
//
// Stream C additions (same page, because recaps and endings belong to the
// archive too):
// - Dated recaps for the active chronicle — APPEND-ONLY. Writing a new
//   recap never touches an earlier one; the form collects labelled
//   sections and stores them as one body field (see src/lib/archive.ts).
// - Ending records for the active chronicle: final era/age/location,
//   ending type, what was lost, what endured, the final scene, and an
//   epilogue. Completing a chronicle only flips its status — it NEVER
//   locks the data: everything stays reviewable and editable afterwards.
// - Each completed chronicle in the list shows its ending record(s).
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { archiveChronicle, deleteChronicle, duplicateChronicle, restoreChronicle } from '../db/database'
import { useAppStore } from '../state/store'
import { downloadJsonBackup, getDb } from '../lib/export'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Textarea } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import { useLiveList } from '../lib/live'
import {
  RECAP_SECTIONS,
  createEnding,
  createRecap,
  listArchivedChronicles,
  listEndings,
  listRecaps,
  parseRecapBody,
} from '../lib/archive'
import type { RecapSections } from '../lib/archive'
import type { Chronicle, Ending, Recap } from '../db/types'
import WritingStatsPanel from '../components/WritingStatsPanel'

export default function Archive() {
  const chronicles = useAppStore((s) => s.chronicles)
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const [deleting, setDeleting] = useState<Chronicle | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const chronicleId = activeChronicle?.id ?? null
  const recaps = useLiveList(() => (chronicleId ? listRecaps(chronicleId) : Promise.resolve([])), [chronicleId])
  const endings = useLiveList(() => (chronicleId ? listEndings(chronicleId) : Promise.resolve([])), [chronicleId])
  const [archivedMeta, setArchivedMeta] = useState<Record<string, { endings: Ending[]; recapCount: number }>>({})
  const [recapFormOpen, setRecapFormOpen] = useState(false)
  const [endingFormOpen, setEndingFormOpen] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

  const [recapTitle, setRecapTitle] = useState('')
  const [recapEra, setRecapEra] = useState('')
  const [recapSections, setRecapSections] = useState<RecapSections>({})

  // Time-jump recap offer: the dialog navigates here with router state
  // { openRecap, recapEra, recapTitle } — open the recap form prefilled,
  // never forced; the player can still close it without writing anything.
  const location = useLocation()
  useEffect(() => {
    const state = location.state as { openRecap?: boolean; recapEra?: string; recapTitle?: string } | null
    if (state?.openRecap) {
      if (state.recapEra) setRecapEra(state.recapEra)
      if (state.recapTitle) setRecapTitle(state.recapTitle)
      setRecapFormOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [endingEra, setEndingEra] = useState('')
  const [endingAge, setEndingAge] = useState('')
  const [endingLocation, setEndingLocation] = useState('')
  const [endingType, setEndingType] = useState('')
  const [endingLost, setEndingLost] = useState('')
  const [endingEndured, setEndingEndured] = useState('')
  const [endingScene, setEndingScene] = useState('')
  const [endingEpilogue, setEndingEpilogue] = useState('')

  const archived = chronicles.filter((c) => c.status === 'Completed')

  useEffect(() => {
    let cancelled = false
    void listArchivedChronicles().then((rows) => {
      if (cancelled) return
      const map: Record<string, { endings: Ending[]; recapCount: number }> = {}
      for (const row of rows) map[row.chronicle.id] = { endings: row.endings, recapCount: row.recapCount }
      setArchivedMeta(map)
    })
    return () => {
      cancelled = true
    }
  }, [chronicles])

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id)
    try {
      await fn()
      await refreshChronicles()
    } finally {
      setBusyId(null)
    }
  }

  async function submitRecap(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicleId || !recapTitle.trim() || !recapEra.trim()) return
    await createRecap(chronicleId, { title: recapTitle, era: recapEra, sections: recapSections })
    setRecapTitle('')
    setRecapEra('')
    setRecapSections({})
    setRecapFormOpen(false)
    setNotice('Recap added. Earlier recaps are untouched — recaps are never overwritten.')
  }

  async function submitEnding(e: React.FormEvent) {
    e.preventDefault()
    if (!chronicleId || !endingEra.trim()) return
    const age = endingAge.trim() === '' ? null : Number(endingAge)
    if (age !== null && (!Number.isInteger(age) || age < 0)) {
      setNotice('Final age must be a whole number, or left blank.')
      return
    }
    await createEnding(chronicleId, {
      finalEra: endingEra,
      finalAge: age,
      finalLocation: endingLocation || undefined,
      endingType: endingType || undefined,
      whatLost: endingLost || undefined,
      whatEndured: endingEndured || undefined,
      finalScene: endingScene || undefined,
      epilogue: endingEpilogue || undefined,
    })
    setEndingEra('')
    setEndingAge('')
    setEndingLocation('')
    setEndingType('')
    setEndingLost('')
    setEndingEndured('')
    setEndingScene('')
    setEndingEpilogue('')
    setEndingFormOpen(false)
    setNotice('Ending record saved. The chronicle itself is unchanged until you mark it complete.')
  }

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl font-bold">Archive</h1>
      <p className="mb-5 text-sm text-ink-soft dark:text-parchment/70">
        Recaps, endings, and completed chronicles. Nothing here is ever overwritten: recaps accumulate, endings
        are records, and completing a chronicle never locks it — a finished story can still be re-read, corrected,
        and continued.
      </p>
      <p className="mb-5 text-sm">
        <Link to="/snapshots" className="text-oxblood underline dark:text-gold-light">
          Character snapshots by era →
        </Link>
      </p>
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-gold/15 px-3 py-2 text-sm dark:bg-gold/20">
          {notice}
        </p>
      )}

      {/* ---- Recaps + ending for the active chronicle (Stream C) ---- */}
      {activeChronicle ? (
        <>
          <section aria-labelledby="recaps-heading" className="mb-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="recaps-heading" className="font-serif text-2xl font-semibold">
                Recaps — {activeChronicle.title}
              </h2>
              <Button variant="outline" onClick={() => setRecapFormOpen(true)}>
                Write a recap…
              </Button>
            </div>
            <p className="mb-3 text-sm text-ink-soft dark:text-parchment/70">
              A recap is a pause to take stock. Each one is dated and kept — writing a new one never changes an
              old one.
            </p>
            {(recaps ?? []).length === 0 ? (
              <p className="text-sm text-ink-soft dark:text-parchment/70">No recaps yet for this chronicle.</p>
            ) : (
              <ul className="space-y-3">
                {(recaps ?? []).map((recap) => (
                  <RecapCard key={recap.id} recap={recap} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="ending-heading" className="mb-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="ending-heading" className="font-serif text-2xl font-semibold">
                Ending — {activeChronicle.title}
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEndingFormOpen(true)}>
                  Record an ending…
                </Button>
                {activeChronicle.status !== 'Completed' && (
                  <Button variant="gold" onClick={() => setConfirmComplete(true)}>
                    Mark chronicle complete
                  </Button>
                )}
              </div>
            </div>
            <p className="mb-3 text-sm text-ink-soft dark:text-parchment/70">
              {activeChronicle.status === 'Completed'
                ? 'This chronicle is complete — and still fully editable. Completing changes only the status, never the record.'
                : 'Recording an ending does not complete the chronicle. Marking it complete only changes its status — every entry, memory, and note stays editable afterwards.'}
            </p>
            {(endings ?? []).length === 0 ? (
              <p className="text-sm text-ink-soft dark:text-parchment/70">No ending recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {(endings ?? []).map((ending) => (
                  <EndingCard key={ending.id} ending={ending} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <EmptyState title="No active chronicle">
          <p>Start or open a chronicle to write recaps and endings for it.</p>
        </EmptyState>
      )}

      {/* ---- Quiet writing stats (Stream D) ---- */}
      {activeChronicle && (
        <div className="mb-8">
          <WritingStatsPanel chronicleId={activeChronicle.id} variant="full" />
        </div>
      )}

      {/* ---- Completed chronicles (Stream A) ---- */}
      <section aria-labelledby="completed-heading">
        <h2 id="completed-heading" className="mb-3 font-serif text-2xl font-semibold">Completed chronicles</h2>
        <p className="mb-3 text-sm text-ink-soft dark:text-parchment/70">
          Completed chronicles rest here. Restoring one returns it to In Progress; nothing in the archive is ever
          changed by playing another chronicle.
        </p>
        {archived.length === 0 ? (
          <EmptyState
            title="The archive is empty"
            action={<Link to="/chronicles" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">Go to Chronicles</Link>}
          >
            <p>When a chronicle is finished, archiving it (from the Chronicles page) files it here.</p>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {archived.map((c) => {
              const meta = archivedMeta[c.id]
              return (
                <li key={c.id} className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-xl font-semibold">{c.title}</h3>
                      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
                        {c.vampireName} · age {c.currentAge} · {c.currentEra} · {c.currentLocation}
                      </p>
                      <p className="mt-2 text-xs text-ink-faint dark:text-parchment/50">
                        Completed · updated {formatRelativeTime(c.updatedAt)}
                        {c.lastExportAt ? ` · last backed up ${formatRelativeTime(c.lastExportAt)}` : ' · never backed up'}
                        {meta ? ` · ${meta.recapCount} ${meta.recapCount === 1 ? 'recap' : 'recaps'}` : ''}
                      </p>
                      {meta && meta.endings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {meta.endings.map((ending) => (
                            <p key={ending.id} className="text-sm">
                              <span className="font-medium">Ending: </span>
                              {ending.endingType ? `${ending.endingType} — ` : ''}
                              {ending.finalEra}
                              {ending.finalAge !== undefined ? `, age ${ending.finalAge}` : ''}
                              {ending.finalLocation ? `, ${ending.finalLocation}` : ''}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => void run(c.id, () => restoreChronicle(c.id))}>
                        Restore
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => void run(c.id, () => duplicateChronicle(c.id))}>
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void downloadJsonBackup(getDb(), c.id)
                            .then(() => setNotice(`Backup of “${c.title}” downloaded.`))
                            .catch((err) => setNotice(err instanceof Error ? err.message : 'Export failed.'))
                        }}
                      >
                        Export
                      </Button>
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
      </section>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          void run(deleting.id, () => deleteChronicle(deleting.id))
        }}
        title={`Delete “${deleting?.title ?? ''}”?`}
        confirmLabel="Delete forever"
      >
        <p>
          This deletes the archived chronicle and everything in it. There is no server copy and no undo — export a
          backup first if this telling matters to you.
        </p>
        <p>
          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              if (deleting) {
                void downloadJsonBackup(getDb(), deleting.id)
                  .then(() => setNotice(`Backup of “${deleting.title}” downloaded. You can delete it now.`))
                  .catch((err) => setNotice(err instanceof Error ? err.message : 'Export failed.'))
              }
            }}
          >
            Export a backup first
          </Button>
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => {
          if (!activeChronicle) return
          void run(activeChronicle.id, () => archiveChronicle(activeChronicle.id)).then(() =>
            setNotice(`“${activeChronicle.title}” is now Completed. Everything in it stays editable — completing only changes the status.`),
          )
        }}
        title={`Mark “${activeChronicle?.title ?? ''}” complete?`}
        confirmLabel="Mark complete"
      >
        <p>
          This sets the chronicle&rsquo;s status to Completed and files it in the archive below. It does not lock
          anything: entries, memories, people, places, threads, recaps, and the ending itself all stay editable,
          and the chronicle can be restored to In Progress at any time.
        </p>
      </ConfirmDialog>

      <p className="mt-4">
        <Badge tone="muted">Completed chronicles are the archive — there is no separate store.</Badge>
      </p>

      {/* ---- New recap form (Stream C) ---- */}
      <Modal open={recapFormOpen} onClose={() => setRecapFormOpen(false)} title="Write a recap" wide>
        <form onSubmit={(e) => void submitRecap(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="recap-title">
              <Input id="recap-title" value={recapTitle} onChange={(e) => setRecapTitle(e.target.value)} required placeholder="e.g. Recap: the Dunmere years" />
            </Field>
            <Field label="Era" htmlFor="recap-era">
              <Input id="recap-era" value={recapEra} onChange={(e) => setRecapEra(e.target.value)} required placeholder="e.g. early 15th century" />
            </Field>
          </div>
          {RECAP_SECTIONS.map((section) => (
            <Field key={section.key} label={section.label} htmlFor={`recap-${section.key}`}>
              <Textarea
                id={`recap-${section.key}`}
                value={recapSections[section.key] ?? ''}
                onChange={(e) => setRecapSections((s) => ({ ...s, [section.key]: e.target.value }))}
                rows={2}
              />
            </Field>
          ))}
          <p className="text-xs text-ink-faint dark:text-parchment/50">
            Sections left blank are left out. Earlier recaps are never changed by writing a new one.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRecapFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!recapTitle.trim() || !recapEra.trim()}>
              Save recap
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- New ending form (Stream C) ---- */}
      <Modal open={endingFormOpen} onClose={() => setEndingFormOpen(false)} title="Record an ending" wide>
        <form onSubmit={(e) => void submitEnding(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Final era" htmlFor="ending-era">
              <Input id="ending-era" value={endingEra} onChange={(e) => setEndingEra(e.target.value)} required placeholder="e.g. early 16th century" />
            </Field>
            <Field label="Final age (optional)" htmlFor="ending-age">
              <Input id="ending-age" type="number" min={0} value={endingAge} onChange={(e) => setEndingAge(e.target.value)} />
            </Field>
            <Field label="Final location" htmlFor="ending-location">
              <Input id="ending-location" value={endingLocation} onChange={(e) => setEndingLocation(e.target.value)} placeholder="e.g. Dunmere" />
            </Field>
          </div>
          <Field label="Ending type" hint="Free text — e.g. a quiet retirement, a final confrontation, a disappearance." htmlFor="ending-type">
            <Input id="ending-type" value={endingType} onChange={(e) => setEndingType(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What was lost" htmlFor="ending-lost">
              <Textarea id="ending-lost" value={endingLost} onChange={(e) => setEndingLost(e.target.value)} rows={2} />
            </Field>
            <Field label="What endured" htmlFor="ending-endured">
              <Textarea id="ending-endured" value={endingEndured} onChange={(e) => setEndingEndured(e.target.value)} rows={2} />
            </Field>
          </div>
          <Field label="Final scene" htmlFor="ending-scene">
            <Textarea id="ending-scene" value={endingScene} onChange={(e) => setEndingScene(e.target.value)} rows={3} />
          </Field>
          <Field label="Epilogue" htmlFor="ending-epilogue">
            <Textarea id="ending-epilogue" value={endingEpilogue} onChange={(e) => setEndingEpilogue(e.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEndingFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!endingEra.trim()}>
              Save ending
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function RecapCard({ recap }: { recap: Recap }) {
  const sections = parseRecapBody(recap.body)
  return (
    <li className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl font-semibold">{recap.title}</h3>
        <span className="text-xs text-ink-faint dark:text-parchment/50">
          {recap.era} · {formatRelativeTime(recap.createdAt)}
        </span>
      </div>
      {sections.preamble && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{sections.preamble}</p>}
      {RECAP_SECTIONS.map(({ key, label }) => {
        const text = sections[key]
        if (!text) return null
        return (
          <div key={key} className="mt-3">
            <h4 className="text-sm font-medium text-oxblood dark:text-gold-light">{label}</h4>
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
          </div>
        )
      })}
    </li>
  )
}

function EndingCard({ ending }: { ending: Ending }) {
  const rows: Array<[string, string | undefined]> = [
    ['Final era', ending.finalEra],
    ['Final age', ending.finalAge !== undefined ? String(ending.finalAge) : undefined],
    ['Final location', ending.finalLocation],
    ['Ending type', ending.endingType],
    ['What was lost', ending.whatLost],
    ['What endured', ending.whatEndured],
    ['Final scene', ending.finalScene],
    ['Epilogue', ending.epilogue],
  ]
  return (
    <li className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
      <h3 className="font-serif text-xl font-semibold">
        {ending.endingType ? ending.endingType : 'Ending'} — {ending.finalEra}
      </h3>
      <p className="text-xs text-ink-faint dark:text-parchment/50">{formatRelativeTime(ending.createdAt)}</p>
      <dl className="mt-2 space-y-2">
        {rows.map(([label, value]) => {
          if (value === undefined || value === '') return null
          return (
            <div key={label}>
              <dt className="text-sm font-medium text-oxblood dark:text-gold-light">{label}</dt>
              <dd className="whitespace-pre-wrap text-sm leading-relaxed">{value}</dd>
            </div>
          )
        })}
      </dl>
    </li>
  )
}
