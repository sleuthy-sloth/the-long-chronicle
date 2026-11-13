// Time-jump dialog (Feature 2): "Centuries pass."
//
// Pre-filled with the chronicle's current era / age / location — all
// editable, eras as free text. Optional note, snapshot checkbox (default
// ON), and an explicit confirmation when the new age is lower than the
// current one: a jump never makes the vampire younger unless the player
// says the lower age is a correction.
//
// On success the dialog offers to start a recap for the new era: it
// navigates to the Archive with router state `{ openRecap: true, recapEra,
// recapTitle }` so the Archive's recap form opens prefilled — prefilled,
// not forced; the player can still close it without writing anything.
// (The Archive reading that state is a wiring step — see the stream report.)
// The snapshot creator is injected (src/lib/snapshots.ts, parallel stream);
// if none is supplied yet, the snapshot option is disabled and explained.
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { performTimeJump, type TimeJumpInput, type TimeJumpResult } from '../lib/timeJump'
import type { Chronicle } from '../db/types'
import { useAppStore } from '../state/store'
import { Button, Field, Input, Modal, Textarea } from './ui'

type CreateSnapshotFn = NonNullable<TimeJumpInput['createSnapshot']>

export interface TimeJumpDialogProps {
  open: boolean
  onClose: () => void
  chronicle: Chronicle
  /** Injected snapshot creator; omit until the snapshots module lands. */
  createSnapshot?: CreateSnapshotFn
  /** Called after a successful jump, with the jump result. */
  onJumped?: (result: TimeJumpResult) => void
}

export default function TimeJumpDialog({ open, onClose, chronicle, createSnapshot, onJumped }: TimeJumpDialogProps) {
  const navigate = useNavigate()
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const [newEra, setNewEra] = useState(chronicle.currentEra)
  const [newAge, setNewAge] = useState(String(chronicle.currentAge))
  const [newLocation, setNewLocation] = useState(chronicle.currentLocation)
  const [note, setNote] = useState('')
  const [takeSnapshot, setTakeSnapshot] = useState(true)
  const [confirmDecrease, setConfirmDecrease] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<TimeJumpResult | null>(null)

  // Re-seed the form whenever the dialog opens for a (possibly new) chronicle.
  useEffect(() => {
    if (!open) return
    setNewEra(chronicle.currentEra)
    setNewAge(String(chronicle.currentAge))
    setNewLocation(chronicle.currentLocation)
    setNote('')
    setTakeSnapshot(true)
    setConfirmDecrease(false)
    setError(null)
    setSaving(false)
    setDone(null)
  }, [open, chronicle])

  const ageNumber = Number(newAge)
  const ageDecreases =
    newAge.trim() !== '' && Number.isInteger(ageNumber) && ageNumber < chronicle.currentAge
  const canSubmit =
    newEra.trim() !== '' &&
    newLocation.trim() !== '' &&
    newAge.trim() !== '' &&
    Number.isInteger(ageNumber) &&
    ageNumber >= 0 &&
    (!ageDecreases || confirmDecrease)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) {
      if (ageDecreases && !confirmDecrease) {
        setError('The new age is lower than the current age. Confirm this is a correction before jumping.')
      } else {
        setError('Fill in the new era, a whole-number age, and the new location.')
      }
      return
    }
    setError(null)
    setSaving(true)
    try {
      const result = await performTimeJump(chronicle.id, {
        newEra,
        newAge: ageNumber,
        newLocation,
        note: note || undefined,
        takeSnapshot: takeSnapshot && !!createSnapshot,
        allowAgeDecrease: ageDecreases ? confirmDecrease : undefined,
        createSnapshot,
      })
      await refreshChronicles()
      setDone(result)
      onJumped?.(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The time jump could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function startRecap() {
    if (!done) return
    onClose()
    navigate('/archive', {
      state: {
        openRecap: true,
        recapEra: done.chronicle.currentEra,
        recapTitle: `Recap: ${done.chronicle.currentEra}`,
      },
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={done ? 'Centuries pass' : 'Time jump — centuries pass'} wide>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            {chronicle.vampireName} is now age {done.chronicle.currentAge} in {done.chronicle.currentEra},{' '}
            {done.chronicle.currentLocation}. The jump is recorded in the change history and on the timeline
            {done.snapshot !== undefined ? ', and the character sheet was frozen as a snapshot of the new era.' : '.'}
          </p>
          <p className="text-sm leading-relaxed text-ink-soft dark:text-parchment/80">
            A new era deserves a pause to take stock — start a recap for it now, or come back to the Archive later.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
            <Button onClick={startRecap}>Start a recap for {done.chronicle.currentEra}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-soft dark:text-parchment/80">
            Move {chronicle.vampireName} forward in time. The current era, age, and location are filled in — edit
            them to where the story resumes. Eras are free text; a vague one like “some decades later” is fine.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New era" htmlFor="timejump-era">
              <Input
                id="timejump-era"
                value={newEra}
                onChange={(e) => setNewEra(e.target.value)}
                required
                placeholder="e.g. early 17th century"
              />
            </Field>
            <Field label="New age" htmlFor="timejump-age">
              <Input
                id="timejump-age"
                type="number"
                min={0}
                value={newAge}
                onChange={(e) => setNewAge(e.target.value)}
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="New location" htmlFor="timejump-location">
                <Input
                  id="timejump-location"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  required
                  placeholder="e.g. the port town"
                />
              </Field>
            </div>
          </div>
          <Field
            label="Note (optional)"
            hint="Recorded with the jump in the history and on the timeline."
            htmlFor="timejump-note"
          >
            <Textarea
              id="timejump-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. what the vampire was doing while the years passed"
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={takeSnapshot && !!createSnapshot}
              disabled={!createSnapshot}
              onChange={(e) => setTakeSnapshot(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Freeze a snapshot of the character at the new era
              {!createSnapshot && (
                <span className="block text-xs text-ink-faint dark:text-parchment/60">
                  Snapshots are not available yet — this will be offered once the snapshot feature lands.
                </span>
              )}
            </span>
          </label>
          {ageDecreases && (
            <div role="alert" className="rounded border border-oxblood bg-oxblood/10 p-3 text-sm">
              <p className="font-semibold text-oxblood">
                The new age ({ageNumber}) is lower than the current age ({chronicle.currentAge}).
              </p>
              <p className="mt-1 text-ink-soft dark:text-parchment/80">
                A time jump cannot make the vampire younger. Only continue if the current age is wrong and this is a
                correction to the record.
              </p>
              <label className="mt-2 flex items-start gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={confirmDecrease}
                  onChange={(e) => setConfirmDecrease(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Yes, this is a correction — the age should go down.</span>
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded border border-oxblood bg-oxblood/10 p-3 text-sm font-semibold text-oxblood">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? 'Jumping…' : 'Jump forward in time'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
