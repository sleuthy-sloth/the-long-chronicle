// Gap C tests: the editor font-size setting reaches the journal editor.
//
// The repo runs Vitest in a node environment (no jsdom — see
// vitest.config.ts), so there is no browser DOM to click through. What IS
// testable here, and what these tests prove:
//  - the stored value resolves to a sane px size (defaults, clamping),
//  - the full JournalEditorForm, rendered to HTML with react-dom/server,
//    puts the store-derived size on the writing-area textarea's inline
//    style,
//  - the extracted Markdown preview component applies the same style,
//  - changing the setting updates the store, notifies subscribers (the
//    exact mechanism that re-renders the subscribed form in a browser),
//    and persists to Dexie, so it survives a reload.
// What they do NOT prove: a real browser interaction (change the setting
// in Settings, watch an open editor resize). That needs Playwright, which
// cannot launch Chromium in this sandbox. One node-specific limit is
// documented on the SSR test below: during renderToStaticMarkup React
// reads zustand's server snapshot, which is the store's *initial* state,
// so an SSR render can only ever show the default size — the store tests
// are what prove a changed value flows and notifies.
import { beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DEFAULT_EDITOR_FONT_SIZE,
  EDITOR_FONT_SIZE_OPTIONS,
  MAX_EDITOR_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  editorFontSizeStyle,
  resolveEditorFontSize,
} from '../src/lib/editorFont'
import JournalEditorForm, { JournalBodyPreview } from '../src/components/JournalEditorForm'
import { useAppStore } from '../src/state/store'
import { DEFAULT_SETTINGS, createChronicle, getSettings, resetDb } from '../src/db/database'
import type { Chronicle } from '../src/db/types'

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('resolveEditorFontSize', () => {
  it('defaults when nothing is stored', () => {
    expect(resolveEditorFontSize(undefined)).toBe(DEFAULT_EDITOR_FONT_SIZE)
    expect(resolveEditorFontSize(null)).toBe(DEFAULT_EDITOR_FONT_SIZE)
    expect(resolveEditorFontSize(NaN)).toBe(DEFAULT_EDITOR_FONT_SIZE)
  })

  it('passes a stored size through unchanged', () => {
    expect(resolveEditorFontSize(14)).toBe(14)
    expect(resolveEditorFontSize(20)).toBe(20)
  })

  it('clamps to the validated 12–24 range and rounds', () => {
    expect(resolveEditorFontSize(8)).toBe(MIN_EDITOR_FONT_SIZE)
    expect(resolveEditorFontSize(40)).toBe(MAX_EDITOR_FONT_SIZE)
    expect(resolveEditorFontSize(17.6)).toBe(18)
  })
})

describe('editorFontSizeStyle', () => {
  it('returns an inline font-size style in px', () => {
    expect(editorFontSizeStyle(18)).toEqual({ fontSize: '18px' })
    expect(editorFontSizeStyle(undefined)).toEqual({ fontSize: `${DEFAULT_EDITOR_FONT_SIZE}px` })
  })

  it('the Settings options are all valid sizes and include the default', () => {
    expect(EDITOR_FONT_SIZE_OPTIONS).toContain(DEFAULT_EDITOR_FONT_SIZE)
    for (const n of EDITOR_FONT_SIZE_OPTIONS) {
      expect(n).toBeGreaterThanOrEqual(MIN_EDITOR_FONT_SIZE)
      expect(n).toBeLessThanOrEqual(MAX_EDITOR_FONT_SIZE)
    }
  })
})

describe('journal editor applies the setting', () => {
  let chronicle: Chronicle

  beforeEach(async () => {
    await resetDb()
    chronicle = await createChronicle({
      title: 'The Venice Years',
      vampireName: 'Isabetta',
      pronouns: 'she/her',
      startingAge: 25,
      startingEra: 'late 14th century',
      startingLocation: 'Venice',
      concept: 'A glassblower’s apprentice who never left the lagoon.',
      tension: 'The old family still hunts her.',
    })
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, editorFontSize: 16 } })
  })

  function renderForm() {
    return renderToStaticMarkup(
      createElement(JournalEditorForm, {
        chronicle,
        entry: null,
        draft: null,
        people: [],
        places: [],
        skills: [],
        resources: [],
        memories: [],
        onAutosave: async () => {},
        onSave: async () => {},
        onCancel: () => {},
      }),
    )
  }

  it('puts the store-derived size on the writing-area textarea', () => {
    // SSR renders zustand's server snapshot (the store's initial state,
    // 16px), so this proves the textarea is wired to the store-derived
    // style — not that a later change re-renders, which the store tests
    // below cover at the subscription level.
    const html = renderForm()
    expect(html).toContain('aria-label="Journal entry body (Markdown supported)"')
    expect(countOccurrences(html, `font-size:${DEFAULT_EDITOR_FONT_SIZE}px`)).toBe(1)
  })

  it('the Markdown preview applies the same size', () => {
    const html = renderToStaticMarkup(
      createElement(JournalBodyPreview, { body: '# A night in Venice\n\nSome **bold** text.', style: editorFontSizeStyle(18) }),
    )
    expect(html).toContain('font-size:18px')
    expect(html).toContain('A night in Venice')
    expect(html).toContain('<strong>bold</strong>')
  })
})

describe('setting change flows through the store (the live-update path)', () => {
  beforeEach(async () => {
    await resetDb()
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, editorFontSize: 16 } })
  })

  it('setEditorFontSize updates the store, persists to Dexie, and notifies subscribers', async () => {
    const seen: number[] = []
    const unsub = useAppStore.subscribe((s) => {
      seen.push(s.settings.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE)
    })
    try {
      await useAppStore.getState().setEditorFontSize(20)
    } finally {
      unsub()
    }
    // The value the editor subscribes to.
    expect(useAppStore.getState().settings.editorFontSize).toBe(20)
    // Subscribers are notified — in the browser this is what re-renders
    // the open editor at the new size, with no reload.
    expect(seen).toContain(20)
    // Persisted, so a reload (loadInitial reads Dexie) restores it.
    expect((await getSettings()).editorFontSize).toBe(20)
  })
})
