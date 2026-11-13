// Age / time helper (Stream C).
//
// The vampire's eras are free text, so the helper only calculates when
// both eras carry a 4-digit year. When either is approximate ("late 14th
// century"), it says so plainly and offers a manual age override instead
// of inventing a number. Editing the eras or the starting age here writes
// straight back to the active chronicle.
import { useState } from 'react'
import { updateChronicle } from '../db/database'
import { useAppStore } from '../state/store'
import { Button, EmptyState, Field, Input } from './ui'
import { computeAge, formatAgeSummary } from '../lib/age'

export default function AgeHelper() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const [startingEra, setStartingEra] = useState<string | null>(null)
  const [currentEra, setCurrentEra] = useState<string | null>(null)
  const [startingAge, setStartingAge] = useState<number | null>(null)
  const [manualAge, setManualAge] = useState<string>('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!activeChronicle) {
    return (
      <EmptyState title="No chronicle yet">
        <p>Start a chronicle first — ages belong to the vampire whose life you are recording.</p>
      </EmptyState>
    )
  }

  const eraStart = startingEra ?? activeChronicle.startingEra
  const eraCurrent = currentEra ?? activeChronicle.currentEra
  const ageStart = startingAge ?? activeChronicle.startingAge
  const calc = computeAge(ageStart, eraStart, eraCurrent)
  const storedAge = activeChronicle.currentAge

  async function save(patch: { startingEra?: string; currentEra?: string; startingAge?: number; currentAge?: number }, note: string) {
    setBusy(true)
    try {
      await updateChronicle(activeChronicle!.id, patch)
      await refreshChronicles()
      setMessage(note)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="age-helper-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
      <h2 id="age-helper-heading" className="font-serif text-xl font-semibold">Age &amp; time helper</h2>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
        Eras are free text, so time is only counted when both eras name a year. Approximate dates are never
        turned into a number behind your back.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Starting era" htmlFor="age-start-era">
          <Input
            id="age-start-era"
            value={eraStart}
            onChange={(e) => setStartingEra(e.target.value)}
            onBlur={() => {
              if (eraStart !== activeChronicle.startingEra) void save({ startingEra: eraStart }, 'Starting era saved.')
            }}
          />
        </Field>
        <Field label="Current era" htmlFor="age-current-era">
          <Input
            id="age-current-era"
            value={eraCurrent}
            onChange={(e) => setCurrentEra(e.target.value)}
            onBlur={() => {
              if (eraCurrent !== activeChronicle.currentEra) void save({ currentEra: eraCurrent }, 'Current era saved.')
            }}
          />
        </Field>
        <Field label="Age when the chronicle began" htmlFor="age-start-age">
          <Input
            id="age-start-age"
            type="number"
            min={0}
            value={ageStart}
            onChange={(e) => setStartingAge(Number(e.target.value))}
            onBlur={() => {
              if (ageStart !== activeChronicle.startingAge && Number.isInteger(ageStart) && ageStart >= 0) {
                void save({ startingAge: ageStart }, 'Starting age saved.')
              }
            }}
          />
        </Field>
      </div>

      <div aria-live="polite" className="mt-4 rounded-md bg-parchment-deep/60 px-4 py-3 dark:bg-charcoal-panel/60">
        {calc.calculable ? (
          <p className="text-sm">
            <span className="font-serif text-xl font-bold">{formatAgeSummary(calc)}</span>
            <span className="block text-ink-soft dark:text-parchment/70">
              Recorded age on the chronicle: {storedAge}.{' '}
              {storedAge !== calc.currentAge && (
                <>It differs from the calculation — use “Set age from calculation” below, or keep your manual age.</>
              )}
            </span>
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-medium">Cannot calculate from approximate date — enter age manually.</span>
            <span className="block text-ink-soft dark:text-parchment/70">{calc.reason}</span>
          </p>
        )}
        {calc.calculable && (
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || storedAge === calc.currentAge}
              onClick={() => void save({ currentAge: calc.currentAge! }, `Age set to ${calc.currentAge} from the calculation.`)}
            >
              Set age from calculation ({calc.currentAge})
            </Button>
          </div>
        )}
      </div>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const value = Number(manualAge)
          if (!Number.isInteger(value) || value < 0) {
            setMessage('Enter a whole number of years (0 or more).')
            return
          }
          void save({ currentAge: value }, `Current age set to ${value} manually.`)
        }}
      >
        <Field label="Current age (manual override)" hint="For approximate or fictional dates — your word, not a calculation." htmlFor="age-manual">
          <Input
            id="age-manual"
            type="number"
            min={0}
            value={manualAge}
            placeholder={String(storedAge)}
            onChange={(e) => setManualAge(e.target.value)}
            className="w-32"
          />
        </Field>
        <Button type="submit" disabled={busy}>
          Save manual age
        </Button>
      </form>

      {message && (
        <p role="status" className="mt-3 text-sm text-ink-soft dark:text-parchment/70">
          {message}
        </p>
      )}
    </section>
  )
}
