// App shell (Stream A): persistent left nav on desktop, top bar + bottom nav
// on mobile. Chronicle switcher lives in the sidebar (desktop) and the top
// bar (mobile). The header shows the save indicator and the search trigger.
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { APP } from '../config/app'
import { useAppStore } from '../state/store'
import { Kbd, Modal, SaveIndicator } from './ui'
import ThemeToggle from './ThemeToggle'
import SearchPalette from './SearchPalette'
import UpdatePrompt from './UpdatePrompt'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '✦', end: true },
  { to: '/chronicles', label: 'Chronicles', icon: '❦' },
  { to: '/character', label: 'Current Character', icon: '☉' },
  { to: '/memories', label: 'Memories', icon: '✧' },
  { to: '/journal', label: 'Journal', icon: '✎' },
  { to: '/timeline', label: 'Timeline', icon: '↝' },
  { to: '/people', label: 'People & Places', icon: '⚭' },
  { to: '/threads', label: 'Story Threads', icon: '❧' },
  { to: '/utilities', label: 'Utilities', icon: '⚒' },
  { to: '/archive', label: 'Archive', icon: '▣' },
  { to: '/settings', label: 'Settings & Data', icon: '⚙' },
] as const

const MOBILE_NAV = ['/', '/chronicles', '/character', '/journal', '/settings'] as const

const SHORTCUTS: Array<[string, string]> = [
  ['⌘/Ctrl K', 'Open global search'],
  ['⌘/Ctrl N', 'New journal entry'],
  ['⌘/Ctrl S', 'Save everything now'],
  ['⌘/Ctrl ⇧ M', 'New memory'],
  ['Esc', 'Close dialog or search'],
]

function ChronicleSwitcher({ id }: { id: string }) {
  const chronicles = useAppStore((s) => s.chronicles)
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const setActiveChronicle = useAppStore((s) => s.setActiveChronicle)
  const navigate = useNavigate()
  return (
    <select
      id={id}
      aria-label="Active chronicle"
      value={activeChronicle?.id ?? ''}
      onChange={(e) => {
        const next = e.target.value
        if (next === '__new__') navigate('/chronicles')
        else void setActiveChronicle(next || null)
      }}
      className="w-full rounded-md border border-ink/25 bg-white/60 px-2 py-1.5 text-sm text-ink dark:border-parchment/25 dark:bg-charcoal-panel dark:text-parchment"
    >
      {chronicles.length === 0 && <option value="">No chronicle yet</option>}
      {chronicles.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title} — {c.vampireName}
        </option>
      ))}
      <option value="__new__">+ Manage chronicles…</option>
    </select>
  )
}

export function ShortcutsHelp() {
  const helpOpen = useAppStore((s) => s.helpOpen)
  const setHelpOpen = useAppStore((s) => s.setHelpOpen)
  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
      <ul className="space-y-2 text-sm">
        {SHORTCUTS.map(([keys, desc]) => (
          <li key={keys} className="flex items-center justify-between gap-4">
            <span className="text-ink-soft dark:text-parchment/80">{desc}</span>
            <Kbd>{keys}</Kbd>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-ink-faint dark:text-parchment/60">
        On macOS use ⌘; on Windows and Linux use Ctrl. Shortcuts never fire while you are typing in a field,
        except ⌘/Ctrl+K and Esc.
      </p>
    </Modal>
  )
}

export default function Layout() {
  const setSearchOpen = useAppStore((s) => s.setSearchOpen)
  const setHelpOpen = useAppStore((s) => s.setHelpOpen)
  const activeChronicle = useAppStore((s) => s.activeChronicle)

  return (
    <div className="min-h-screen bg-parchment text-ink dark:bg-charcoal dark:text-parchment">
      <UpdatePrompt />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink/10 bg-parchment-deep/60 px-4 py-5 dark:border-parchment/10 dark:bg-charcoal-panel/60 md:flex">
        <div className="mb-1 px-1">
          <p className="font-serif text-xl font-bold leading-tight text-ink dark:text-parchment">{APP.name}</p>
          <p className="text-xs italic text-ink-faint dark:text-parchment/60">The Immortal&rsquo;s Archive</p>
        </div>
        <div className="mb-4 mt-4">
          <label htmlFor="chronicle-switcher" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint dark:text-parchment/60">
            Active chronicle
          </label>
          <ChronicleSwitcher id="chronicle-switcher" />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item && item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-oxblood font-medium text-white'
                    : 'text-ink-soft hover:bg-ink/5 dark:text-parchment/80 dark:hover:bg-parchment/10'
                }`
              }
            >
              <span aria-hidden="true" className="w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 space-y-2 border-t border-ink/10 pt-3 dark:border-parchment/10">
          <div className="flex items-center justify-between px-1">
            <SaveIndicator />
            <ThemeToggle compact />
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="w-full rounded-md px-3 py-1.5 text-left text-xs text-ink-faint hover:bg-ink/5 dark:text-parchment/60 dark:hover:bg-parchment/10"
          >
            Keyboard shortcuts <Kbd>?</Kbd>
          </button>
          <p className="px-3 text-[11px] text-ink-faint/80 dark:text-parchment/40">v{APP.version} · Local only — no account, no cloud.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-ink/10 bg-parchment/95 px-4 py-3 backdrop-blur dark:border-parchment/10 dark:bg-charcoal/95 md:hidden">
        <p className="font-serif text-lg font-bold leading-none">{APP.name}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search (Ctrl+K)"
            title="Search (Ctrl+K)"
            className="rounded-md p-2 text-lg leading-none text-ink-soft hover:bg-ink/5 dark:text-parchment/80 dark:hover:bg-parchment/10"
          >
            ⌕
          </button>
          <ThemeToggle compact />
        </div>
      </header>

      {/* Content */}
      <div className="md:pl-64">
        <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-6 md:pb-12 md:pt-8">
          {/* Desktop toolbar */}
          <div className="mb-6 hidden items-center justify-between md:flex">
            <div className="min-w-0">
              {activeChronicle ? (
                <p className="truncate text-sm text-ink-soft dark:text-parchment/70">
                  <span className="font-serif text-base font-semibold text-ink dark:text-parchment">{activeChronicle.vampireName}</span>
                  {' · '}
                  {activeChronicle.currentEra} · {activeChronicle.currentLocation} · age {activeChronicle.currentAge}
                </p>
              ) : (
                <p className="text-sm text-ink-soft dark:text-parchment/70">No chronicle yet — begin one to start the record.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title="Search (Ctrl+K)"
                className="flex items-center gap-2 rounded-md border border-ink/25 px-3 py-1.5 text-sm text-ink-soft hover:border-oxblood hover:text-oxblood dark:border-parchment/30 dark:text-parchment/80 dark:hover:border-gold-light dark:hover:text-gold-light"
              >
                ⌕ Search <Kbd>⌘K</Kbd>
              </button>
              <SaveIndicator />
            </div>
          </div>
          {/* Mobile chronicle switcher */}
          <div className="mb-5 md:hidden">
            <ChronicleSwitcher id="chronicle-switcher-mobile" />
          </div>
          <Outlet />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink/10 bg-parchment-card/95 backdrop-blur dark:border-parchment/10 dark:bg-charcoal-panel/95 md:hidden">
        {MOBILE_NAV.map((to) => {
          const item = NAV_ITEMS.find((n) => n.to === to)!
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                  isActive ? 'font-semibold text-oxblood dark:text-gold-light' : 'text-ink-soft dark:text-parchment/70'
                }`
              }
            >
              <span aria-hidden="true" className="text-base leading-none">{item.icon}</span>
              {item.label.split(' ')[0]}
            </NavLink>
          )
        })}
      </nav>

      <SearchPalette />
      <ShortcutsHelp />
    </div>
  )
}
