// Editor font size (Gap C).
//
// The setting lives in AppSettings.editorFontSize (Dexie, mirrored in the
// Zustand store) as a point size in px. Nothing here knows about storage:
// these helpers only resolve a stored value to a concrete size and to the
// React style the editors apply. The bounds match the Zod schema in
// src/db/validation.ts (12–24); the default matches DEFAULT_SETTINGS.
import type { CSSProperties } from 'react'

/** Font size used when nothing is stored yet. */
export const DEFAULT_EDITOR_FONT_SIZE = 16

export const MIN_EDITOR_FONT_SIZE = 12
export const MAX_EDITOR_FONT_SIZE = 24

/** The sizes offered by the Settings control. */
export const EDITOR_FONT_SIZE_OPTIONS = [14, 15, 16, 17, 18, 20] as const

/**
 * Resolve a stored value to a usable px size: missing, non-finite, or
 * out-of-range values fall back to (or clamp to) the supported range so the
 * editor never renders at a absurd or zero size from a stale/corrupt row.
 */
export function resolveEditorFontSize(size: number | null | undefined): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(size)))
}

/** The inline style the journal editor and note editors apply. */
export function editorFontSizeStyle(size: number | null | undefined): CSSProperties {
  return { fontSize: `${resolveEditorFontSize(size)}px` }
}
