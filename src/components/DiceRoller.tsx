// Generic dice roller (Stream C).
//
// Plain dice, nothing else: pick a standard die or a custom count/size,
// roll, see the result, keep a persisted history. It encodes NO game
// procedure — the player decides what a roll means. "Copy" puts the
// result text on the clipboard (with a textarea fallback for browsers
// without the Clipboard API) and "Save as note" stores it as a PromptNote
// so the Journal editor can pick it up.
import { useState } from 'react'
import { db } from '../db/database'
import { newId, nowIso } from '../db/types'
import { useAppStore } from '../state/store'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input } from './ui'
import { useLiveList } from '../lib/live'
import { clearDiceRolls, listDiceRolls, saveDiceRoll } from '../lib/notes'
import {
  MAX_DICE_COUNT,
  MAX_DIE_SIDES,
  MIN_DICE_COUNT,
  MIN_DIE_SIDES,
  STANDARD_DICE,
  formatRollText,
  rollDice,
} from '../lib/dice'
import type { RollResult } from '../lib/dice'
import { formatRelativeTime } from '../lib/utils'

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the textarea method below.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export default function DiceRoller() {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const chronicleId = activeChronicle?.id ?? null
  const history = useLiveList(() => (chronicleId ? listDiceRolls(chronicleId) : Promise.resolve([])), [chronicleId])
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null)
  const [customCount, setCustomCount] = useState(1)
  const [customSides, setCustomSides] = useState(6)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)

  async function doRoll(count: number, sides: number) {
    if (!chronicleId) return
    setBusy(true)
    try {
      const result = rollDice({ count, sides })
      setLastRoll(result)
      await saveDiceRoll(chronicleId, result, note.trim() || undefined)
      setMessage(`Rolled ${result.dice}: ${result.total}. Saved to history.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Roll failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onCopy() {
    if (!lastRoll) return
    const ok = await copyText(formatRollText(lastRoll))
    setMessage(ok ? `Copied “${formatRollText(lastRoll)}” to the clipboard.` : 'Copy failed — select the result text and copy it by hand.')
  }

  async function onSaveAsNote() {
    if (!lastRoll || !chronicleId) return
    const now = nowIso()
    await db.promptNotes.put({
      id: newId(),
      chronicleId,
      createdAt: now,
      updatedAt: now,
      text: `Dice roll — ${formatRollText(lastRoll)}${note.trim() ? ` (${note.trim()})` : ''}`,
      journalEntryId: null,
    })
    setMessage('Saved as a prompt note for the journal.')
  }

  if (!activeChronicle) {
    return (
      <EmptyState title="No chronicle yet">
        <p>Start a chronicle first — dice rolls are kept with the chronicle they belong to.</p>
      </EmptyState>
    )
  }

  return (
    <section aria-labelledby="dice-roller-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-4 dark:border-parchment/15 dark:bg-charcoal-card">
      <h2 id="dice-roller-heading" className="font-serif text-xl font-semibold">Dice roller</h2>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/70">
        Plain dice for any purpose. Nothing here knows the rules — you decide what a roll means.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Standard dice</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {STANDARD_DICE.map((sides) => (
            <Button key={sides} variant="outline" size="sm" disabled={busy} onClick={() => void doRoll(1, sides)}>
              d{sides}
            </Button>
          ))}
        </div>
      </fieldset>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void doRoll(customCount, customSides)
        }}
      >
        <Field label="Number of dice" htmlFor="dice-count">
          <Input
            id="dice-count"
            type="number"
            min={MIN_DICE_COUNT}
            max={MAX_DICE_COUNT}
            value={customCount}
            onChange={(e) => setCustomCount(Number(e.target.value))}
            className="w-24"
          />
        </Field>
        <Field label="Sides per die" htmlFor="dice-sides">
          <Input
            id="dice-sides"
            type="number"
            min={MIN_DIE_SIDES}
            max={MAX_DIE_SIDES}
            value={customSides}
            onChange={(e) => setCustomSides(Number(e.target.value))}
            className="w-24"
          />
        </Field>
        <Button type="submit" disabled={busy}>
          Roll {customCount}d{customSides}
        </Button>
      </form>

      <div className="mt-4">
        <Field label="Note for this roll (optional)" htmlFor="dice-note">
          <Input
            id="dice-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. checking whether the old bridge holds"
          />
        </Field>
      </div>

      <div aria-live="polite" className="mt-4 rounded-md bg-parchment-deep/60 px-4 py-3 dark:bg-charcoal-panel/60">
        {lastRoll ? (
          <p>
            <span className="font-serif text-2xl font-bold">{lastRoll.total}</span>{' '}
            <span className="text-sm text-ink-soft dark:text-parchment/70">
              {lastRoll.dice}: [{lastRoll.results.join(', ')}]
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-soft dark:text-parchment/70">No roll yet — pick a die above.</p>
        )}
        {lastRoll && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void onCopy()}>
              Copy result
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onSaveAsNote()}>
              Save as prompt note
            </Button>
          </div>
        )}
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-ink-soft dark:text-parchment/70">
          {message}
        </p>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg font-semibold">Roll history</h3>
          {history && history.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
              Clear history…
            </Button>
          )}
        </div>
        {!history || history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft dark:text-parchment/70">No rolls yet in this chronicle.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {history.slice(0, 20).map((roll) => (
              <li key={roll.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  <Badge tone="gold">{roll.dice}</Badge>{' '}
                  <span className="font-medium">[{roll.results.join(', ')}] = {roll.total}</span>
                  {roll.note && <span className="text-ink-soft dark:text-parchment/70"> — {roll.note}</span>}
                </span>
                <span className="text-xs text-ink-faint dark:text-parchment/50">{formatRelativeTime(roll.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          if (chronicleId) void clearDiceRolls(chronicleId).then(() => setMessage('Roll history cleared.'))
        }}
        title="Clear roll history?"
        confirmLabel="Clear history"
      >
        <p>This deletes every saved roll for this chronicle. The dice themselves are unaffected.</p>
      </ConfirmDialog>

    </section>
  )
}
