// App shell (Stream A): routes, theme, global keyboard shortcuts.
//
// Routes owned by other streams (Journal, Memories) are wired in here;
// routes with no page yet (Timeline, People & Places) render a clearly
// marked placeholder instead of a 404, so the Dashboard's quick actions
// never land on a dead end. Nothing here is pushed to a server — the app is
// local-only.
import { lazy, Suspense, useEffect } from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import { flushAllAutosaves, useAppStore } from './state/store'
import { Button, EmptyState } from './components/ui'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Chronicles = lazy(() => import('./pages/Chronicles'))
const Character = lazy(() => import('./pages/Character'))
const Settings = lazy(() => import('./pages/Settings'))
const Archive = lazy(() => import('./pages/Archive'))
const Memories = lazy(() => import('./pages/Memories'))
const MemoryDetail = lazy(() => import('./pages/MemoryDetail'))
const Journal = lazy(() => import('./pages/Journal'))
const JournalEditor = lazy(() => import('./pages/JournalEditor'))
const Timeline = lazy(() => import('./pages/Timeline'))
const PeoplePlaces = lazy(() => import('./pages/PeoplePlaces'))
const PersonDetail = lazy(() => import('./pages/PersonDetail'))
const PlaceDetail = lazy(() => import('./pages/PlaceDetail'))
const Threads = lazy(() => import('./pages/Threads'))
const Utilities = lazy(() => import('./pages/Utilities'))
const PromptLog = lazy(() => import('./pages/PromptLog'))
const Review = lazy(() => import('./pages/Review'))
const Snapshots = lazy(() => import('./pages/Snapshots'))

/** Placeholder for routes whose stream has not landed a page yet. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl font-bold">{title}</h1>
      <EmptyState
        title="Still being written"
        action={
          <Link to="/" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">
            Back to Dashboard
          </Link>
        }
      >
        <p>{description}</p>
        <p className="mt-2 text-xs">
          This page belongs to a later stream. Your data is safe — nothing here depends on it existing yet.
        </p>
      </EmptyState>
    </div>
  )
}

function NotFound() {
  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl font-bold">That page isn&rsquo;t in the archive</h1>
      <EmptyState
        title="No such page"
        action={
          <Link to="/" className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white">
            Back to Dashboard
          </Link>
        }
      >
        <p>The address doesn&rsquo;t match anything in this chronicle. The Dashboard is a safe place to start.</p>
      </EmptyState>
    </div>
  )
}

function useGlobalShortcuts() {
  const setSearchOpen = useAppStore((s) => s.setSearchOpen)
  const setHelpOpen = useAppStore((s) => s.setHelpOpen)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (key === 's') {
        // Force save: flush every pending autosave, then report.
        e.preventDefault()
        void flushAllAutosaves()
      } else if (key === 'n' && !typing) {
        e.preventDefault()
        navigate('/journal/new')
      } else if (key === 'm' && e.shiftKey && !typing) {
        e.preventDefault()
        navigate('/memories')
      }
    }
    const onHelpKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement | null
        const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        if (!typing) setHelpOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('keydown', onHelpKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('keydown', onHelpKey)
    }
  }, [navigate, setSearchOpen, setHelpOpen])
}

function useTheme() {
  const theme = useAppStore((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const loadInitial = useAppStore((s) => s.loadInitial)
  useTheme()
  useGlobalShortcuts()

  useEffect(() => {
    void loadInitial().catch((err) => {
      // The app must still render if Dexie is unavailable (e.g. private
      // mode); pages show their empty states instead of crashing.
      console.error('Failed to load local data', err)
    })
  }, [loadInitial])

  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-soft">Opening the archive…</p>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="chronicles" element={<Chronicles />} />
          <Route path="character" element={<Character />} />
          <Route path="memories" element={<Memories />} />
          <Route path="memories/:id" element={<MemoryDetail />} />
          <Route path="review" element={<Review />} />
          <Route path="journal" element={<Journal />} />
          <Route path="journal/new" element={<JournalEditor />} />
          <Route path="journal/:id" element={<JournalEditor />} />
          <Route path="journal/:id/edit" element={<JournalEditor />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="people" element={<PeoplePlaces />} />
          <Route path="people/:personId" element={<PersonDetail />} />
          <Route path="places" element={<PeoplePlaces />} />
          <Route path="places/:placeId" element={<PlaceDetail />} />
          <Route path="threads" element={<Threads />} />
          <Route path="utilities" element={<Utilities />} />
          <Route path="prompts" element={<PromptLog />} />
          <Route path="archive" element={<Archive />} />
          <Route path="snapshots" element={<Snapshots />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
