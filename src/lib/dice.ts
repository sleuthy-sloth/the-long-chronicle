// Generic dice roller (Stream C) — pure functions, no Dexie, no DOM.
//
// This is a plain dice roller: any count and any die size, nothing more.
// It deliberately encodes NO game procedure — no prompt tables, no
// "roll X to do Y", no Thousand Year Old Vampire rules of any kind. The
// player decides what a roll means; the roller only produces numbers.

import { newId, nowIso } from '../db/types'
import type { DiceRoll } from '../db/types'

/** The standard dice offered as quick buttons. */
export const STANDARD_DICE = [4, 6, 8, 10, 12, 20, 100] as const

/** Custom rolls: 1–20 dice, each with 2–1000 sides. */
export const MIN_DICE_COUNT = 1
export const MAX_DICE_COUNT = 20
export const MIN_DIE_SIDES = 2
export const MAX_DIE_SIDES = 1000

export interface DiceSpec {
  count: number
  sides: number
}

/** "3d6" -> { count: 3, sides: 6 }. "d20" -> { count: 1, sides: 20 }. Null on bad input. */
export function parseDiceSpec(spec: string): DiceSpec | null {
  const m = /^\s*(\d*)\s*[dD]\s*(\d+)\s*$/.exec(spec.trim())
  if (!m) return null
  const count = m[1] === '' ? 1 : Number(m[1])
  const sides = Number(m[2])
  if (!Number.isInteger(count) || !Number.isInteger(sides)) return null
  if (!isValidSpec({ count, sides })) return null
  return { count, sides }
}

export function isValidSpec({ count, sides }: DiceSpec): boolean {
  return (
    Number.isInteger(count) &&
    Number.isInteger(sides) &&
    count >= MIN_DICE_COUNT &&
    count <= MAX_DICE_COUNT &&
    sides >= MIN_DIE_SIDES &&
    sides <= MAX_DIE_SIDES
  )
}

export function formatDiceSpec({ count, sides }: DiceSpec): string {
  return `${count}d${sides}`
}

/**
 * One uniform integer in [0, max). Uses crypto.getRandomValues when
 * available (browser + Node 19+), Math.random as the fallback. The
 * crypto path uses rejection sampling so large ranges stay unbiased.
 */
export function randomIntBelow(max: number): number {
  if (!Number.isInteger(max) || max <= 0) throw new Error('randomIntBelow needs a positive integer')
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    // Rejection sampling: discard values that would bias the result.
    const range = 0x100000000 // 2^32
    const limit = range - (range % max)
    const buf = new Uint32Array(1)
    for (;;) {
      cryptoObj.getRandomValues(buf)
      const value = buf[0]
      if (value < limit) return value % max
    }
  }
  return Math.floor(Math.random() * max)
}

/** Roll one die: a number from 1 to `sides` inclusive. */
export function rollDie(sides: number): number {
  if (!Number.isInteger(sides) || sides < MIN_DIE_SIDES || sides > MAX_DIE_SIDES) {
    throw new Error(`Die size must be a whole number from ${MIN_DIE_SIDES} to ${MAX_DIE_SIDES}`)
  }
  return randomIntBelow(sides) + 1
}

export interface RollResult {
  spec: DiceSpec
  dice: string
  results: number[]
  total: number
}

/** Roll `count` dice of `sides` sides. Throws on an out-of-range spec. */
export function rollDice(spec: DiceSpec): RollResult {
  if (!isValidSpec(spec)) {
    throw new Error(`Dice must be ${MIN_DICE_COUNT}–${MAX_DICE_COUNT} dice of ${MIN_DIE_SIDES}–${MAX_DIE_SIDES} sides`)
  }
  const results = Array.from({ length: spec.count }, () => rollDie(spec.sides))
  return { spec, dice: formatDiceSpec(spec), results, total: results.reduce((a, b) => a + b, 0) }
}

/** Build a DiceRoll row (not yet saved) from a roll result. */
export function makeDiceRoll(chronicleId: string, result: RollResult, note?: string): DiceRoll {
  const now = nowIso()
  return {
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    dice: result.dice,
    results: result.results,
    total: result.total,
    note: note?.trim() || undefined,
  }
}

/** One-line text for copying a roll elsewhere, e.g. "2d6: [3, 5] = 8". */
export function formatRollText(result: Pick<RollResult, 'dice' | 'results' | 'total'>): string {
  return `${result.dice}: [${result.results.join(', ')}] = ${result.total}`
}
