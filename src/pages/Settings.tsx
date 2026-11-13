// Settings & Data: theme, editor preferences, and data management.
//
// All export/import/backup UI lives in the single data surface,
// <DataTools /> (src/components/DataTools.tsx) — JSON backup, Markdown
// export, single-record exports, import with validation + preview
// (import-as-new by default, replace only with explicit confirmation),
// and the backup reminder / last-export display. This page keeps only
// the theme, editor font size, keyboard shortcuts, and privacy sections.
// The privacy note is the whole point of the app: everything is local,
// and the browser is not a backup.
import { useAppStore } from '../state/store'
import ThemeToggle from '../components/ThemeToggle'
import DataTools from '../components/DataTools'
import { Field, Kbd, Select } from '../components/ui'
import { EDITOR_FONT_SIZE_OPTIONS } from '../lib/editorFont'

const SHORTCUTS: Array<[string, string]> = [
  ['⌘/Ctrl K', 'Open global search'],
  ['⌘/Ctrl N', 'New journal entry'],
  ['⌘/Ctrl S', 'Save everything now'],
  ['⌘/Ctrl ⇧ M', 'New memory'],
  ['Esc', 'Close dialog or search'],
]

export default function Settings() {
  const settings = useAppStore((s) => s.settings)
  const setEditorFontSize = useAppStore((s) => s.setEditorFontSize)
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)

  return (
    <div>
      <h1 className="mb-5 font-serif text-3xl font-bold">Settings &amp; Data</h1>

      <div className="space-y-8">
        <section aria-labelledby="appearance-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-5 dark:border-parchment/15 dark:bg-charcoal-card">
          <h2 id="appearance-heading" className="mb-4 font-serif text-xl font-semibold">Appearance</h2>
          <div className="space-y-4">
            <Field label="Colour theme" hint="System follows your device's light/dark setting.">
              <ThemeToggle />
            </Field>
            <Field
              label="Editor font size"
              hint="Applies to the journal editor's writing area and Markdown preview, and to quick notes. Takes effect immediately — no reload needed."
            >
              <Select value={settings.editorFontSize ?? 16} onChange={(e) => void setEditorFontSize(Number(e.target.value))}>
                {EDITOR_FONT_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}px{n === 16 ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </section>

        {/* The single data-management surface: JSON backup, Markdown export,
            single-record exports, import, and the backup reminder. */}
        <DataTools onImported={() => void refreshChronicles()} />

        <section aria-labelledby="shortcuts-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-5 dark:border-parchment/15 dark:bg-charcoal-card">
          <h2 id="shortcuts-heading" className="mb-4 font-serif text-xl font-semibold">Keyboard shortcuts</h2>
          <ul className="space-y-2 text-sm">
            {SHORTCUTS.map(([keys, desc]) => (
              <li key={keys} className="flex items-center justify-between gap-4">
                <span className="text-ink-soft dark:text-parchment/80">{desc}</span>
                <Kbd>{keys}</Kbd>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy-heading" className="rounded-lg border border-ink/15 bg-parchment-card p-5 dark:border-parchment/15 dark:bg-charcoal-card">
          <h2 id="privacy-heading" className="mb-2 font-serif text-xl font-semibold">Privacy</h2>
          <p className="text-sm leading-relaxed text-ink-soft dark:text-parchment/70">
            The Long Chronicle is local-only by design. There is no account to create, no server that receives your
            writing, no analytics, no advertising, and no AI processing of your chronicle. Your words stay on your
            device until you choose to export them as a file — and what you do with that file is yours.
          </p>
        </section>
      </div>
    </div>
  )
}
