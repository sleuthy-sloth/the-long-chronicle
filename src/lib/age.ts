// Age / time helper (Stream C) — pure functions, no Dexie, no DOM.
//
// The vampire's eras are free text ("late 14th century", "around 1410",
// "the winter the river froze"). This module only ever calculates from a
// 4-digit year it can actually find. Anything vaguer is NOT silently
// turned into a number: callers must show the manual-entry message
// ("cannot calculate from approximate date — enter age manually") instead.

/** The only years we treat as numeric: a 4-digit year, 1000–2999. */
const YEAR_RE = /\b(1\d{3}|2\d{3})\b/

/**
 * Extract a 4-digit year from a free-text era, or null when there is none.
 * "around 1410" -> 1410. "late 14th century" -> null (a century is not a
 * year). "the 1300s" -> null. "1348, the plague year" -> 1348.
 * Never throws; empty/undefined input returns null.
 */
export function parseYear(era: string | null | undefined): number | null {
  if (!era) return null
  const m = YEAR_RE.exec(era)
  if (!m) return null
  const year = Number(m[1])
  return Number.isFinite(year) ? year : null
}

/** True when the era contains a 4-digit year we can calculate from. */
export function isNumericEra(era: string | null | undefined): boolean {
  return parseYear(era) !== null
}

export interface AgeCalculation {
  /** False when either era lacks a 4-digit year, or the span is impossible. */
  calculable: boolean
  /** Whole years between the two eras, when calculable. */
  elapsedYears: number | null
  /** Starting age + elapsed years, when calculable. */
  currentAge: number | null
  /** Human-readable reason when not calculable (for the UI to show). */
  reason: string | null
}

/**
 * Work out the vampire's current age from a starting age and two eras.
 * Returns calculable: false — with a reason, never a guessed number — when
 * either era has no 4-digit year, or when the current era predates the
 * starting era.
 */
export function computeAge(
  startingAge: number,
  startingEra: string | null | undefined,
  currentEra: string | null | undefined,
): AgeCalculation {
  const startYear = parseYear(startingEra)
  const currentYear = parseYear(currentEra)
  if (startYear === null || currentYear === null) {
    return {
      calculable: false,
      elapsedYears: null,
      currentAge: null,
      reason:
        'Cannot calculate from approximate date — enter age manually. A 4-digit year (for example “1410”) is needed in both the starting era and the current era.',
    }
  }
  const elapsedYears = currentYear - startYear
  if (elapsedYears < 0) {
    return {
      calculable: false,
      elapsedYears: null,
      currentAge: null,
      reason: `The current era (${currentYear}) is earlier than the starting era (${startYear}) — check the dates, or enter the age manually.`,
    }
  }
  return { calculable: true, elapsedYears, currentAge: startingAge + elapsedYears, reason: null }
}

/**
 * The vampire's age in a given year, from a starting age and starting era.
 * Returns null when the starting era has no 4-digit year or the year is
 * before the start — the timeline uses this to show an age next to a dated
 * event only when it can be honestly derived.
 */
export function vampireAgeAtYear(
  startingAge: number,
  startingEra: string | null | undefined,
  year: number | null | undefined,
): number | null {
  const startYear = parseYear(startingEra)
  if (startYear === null || year === null || year === undefined) return null
  const age = startingAge + (year - startYear)
  return age < 0 ? null : age
}

/** One-line summary for display, e.g. "214 years old · 191 years elapsed". */
export function formatAgeSummary(calc: AgeCalculation): string {
  if (!calc.calculable || calc.currentAge === null || calc.elapsedYears === null) {
    return calc.reason ?? 'Age cannot be calculated from these eras.'
  }
  const years = calc.elapsedYears === 1 ? 'year' : 'years'
  return `${calc.currentAge} years old · ${calc.elapsedYears} ${years} elapsed`
}
