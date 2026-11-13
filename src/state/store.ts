// Global app state (Stream A): active chronicle, theme/settings, save status.
//
// Settings live in Dexie (src/db/database.ts) and are mirrored here for
// rendering. The store never invents data: loadInitial() reads Dexie on boot,
// and every setter writes Dexie first, then updates the store.
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import {
  getActiveChronicle,
  getSettings,
  listChronicles,
  saveSettings,
  setActiveChronicleId,
} from '../db/database'
import type { AppSettings, Chronicle } from '../db/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface AppState {
  ready: boolean
  settings: AppSettings
  chronicles: Chronicle[]
  activeChronicle: Chronicle | null
  saveStatus: SaveStatus
  lastSavedAt: string | null
  saveError: string | null
  searchOpen: boolean
  helpOpen: boolean
  loadInitial: () => Promise<void>
  refreshChronicles: () => Promise<void>
  setTheme: (theme: AppSettings['theme']) => Promise<void>
  setEditorFontSize: (size: number) => Promise<void>
  setActiveChronicle: (id: string | null) => Promise<void>
  setSaveStatus: (status: SaveStatus, error?: string | null) => void
  setSearchOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>()((set, get) => ({
  ready: false,
  settings: { id: 'settings', theme: 'system', activeChronicleId: null, lastExportAt: null, editorFontSize: 16 },
  chronicles: [],
  activeChronicle: null,
  saveStatus: 'idle',
  lastSavedAt: null,
  saveError: null,
  searchOpen: false,
  helpOpen: false,

  loadInitial: async () => {
    const [settings, chronicles, active] = await Promise.all([
      getSettings(),
      listChronicles(),
      getActiveChronicle(),
    ])
    set({ settings, chronicles, activeChronicle: active, ready: true })
  },

  refreshChronicles: async () => {
    const [chronicles, active] = await Promise.all([listChronicles(), getActiveChronicle()])
    set({ chronicles, activeChronicle: active })
  },

  setTheme: async (theme) => {
    const settings = await saveSettings({ theme })
    set({ settings })
  },

  setEditorFontSize: async (size) => {
    const settings = await saveSettings({ editorFontSize: size })
    set({ settings })
  },

  setActiveChronicle: async (id) => {
    const settings = await setActiveChronicleId(id)
    const active = await getActiveChronicle()
    set({ settings, activeChronicle: active })
  },

  setSaveStatus: (status, error = null) =>
    set((s) => ({
      saveStatus: status,
      saveError: error,
      lastSavedAt: status === 'saved' ? new Date().toISOString() : s.lastSavedAt,
    })),

  setSearchOpen: (open) => set({ searchOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
}))

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

/** Pending flush functions, so Cmd/Ctrl+S can force every autosave to run now. */
const pendingFlushers = new Set<() => Promise<void>>()

export function registerAutosaveFlusher(flush: () => Promise<void>): () => void {
  pendingFlushers.add(flush)
  return () => {
    pendingFlushers.delete(flush)
  }
}

/** Run every registered autosave immediately (Cmd/Ctrl+S handler). */
export async function flushAllAutosaves(): Promise<void> {
  await Promise.all([...pendingFlushers].map((f) => f().catch(() => undefined)))
}

export interface AutosaveResult {
  /** True while the debounced save is pending or running. */
  dirty: boolean
  /** Save right now instead of waiting for the debounce. */
  flush: () => Promise<void>
}

/**
 * Debounced autosave for a form value. Saves only when the serialised value
 * actually changed; reports progress through the store's save status
 * (announced via aria-live in <SaveIndicator/>). The value is compared with
 * JSON so callers can pass a freshly-built object each render.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delay = 800): AutosaveResult {
  const setSaveStatus = useAppStore((s) => s.setSaveStatus)
  const latestRef = useRef({ value, save })
  latestRef.current = { value, save }
  const lastSavedJsonRef = useRef<string | null>(null)
  const firstRunRef = useRef(true)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useRef(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    const json = JSON.stringify(latestRef.current.value)
    if (json === lastSavedJsonRef.current) {
      dirtyRef.current = false
      return
    }
    dirtyRef.current = false
    setSaveStatus('saving')
    try {
      await latestRef.current.save(latestRef.current.value)
      lastSavedJsonRef.current = json
      setSaveStatus('saved')
    } catch (err) {
      setSaveStatus('error', err instanceof Error ? err.message : 'Save failed')
      throw err
    }
  }).current

  useEffect(() => {
    const json = JSON.stringify(value)
    // First run after mount just records the baseline — loading a form must
    // not count as an edit.
    if (firstRunRef.current) {
      firstRunRef.current = false
      lastSavedJsonRef.current = json
      return
    }
    if (json === lastSavedJsonRef.current) return
    dirtyRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flush()
    }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), delay])

  useEffect(() => registerAutosaveFlusher(flush), [flush])

  return { dirty: dirtyRef.current, flush }
}
