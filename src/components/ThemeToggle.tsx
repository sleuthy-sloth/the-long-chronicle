// Theme toggle (Stream A): Light / Dark / System. Persists to Dexie settings
// via the store; App.tsx applies the matching class to <html>.
import { useAppStore } from '../state/store'
import { cn } from '../lib/utils'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
  { value: 'system', label: 'System', icon: '◐' },
] as const

export default function ThemeToggle({ compact }: { compact?: boolean }) {
  const theme = useAppStore((s) => s.settings.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  if (compact) {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]
    return (
      <button
        type="button"
        onClick={() => void setTheme(next)}
        title={`Theme: ${current.label} — click to switch`}
        aria-label={`Theme: ${current.label}. Activate to switch theme.`}
        className="rounded-md p-2 text-lg leading-none text-ink-soft hover:bg-ink/5 dark:text-parchment/80 dark:hover:bg-parchment/10"
      >
        <span aria-hidden="true">{current.icon}</span>
      </button>
    )
  }
  return (
    <div role="group" aria-label="Colour theme" className="inline-flex rounded-md border border-ink/25 dark:border-parchment/30">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => void setTheme(o.value)}
          aria-pressed={theme === o.value}
          title={`${o.label} theme`}
          className={cn(
            'px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md',
            theme === o.value
              ? 'bg-oxblood font-medium text-white'
              : 'text-ink-soft hover:bg-ink/5 dark:text-parchment/80 dark:hover:bg-parchment/10',
          )}
        >
          <span aria-hidden="true">{o.icon}</span> {o.label}
        </button>
      ))}
    </div>
  )
}
