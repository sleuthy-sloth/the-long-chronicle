// Shared UI primitives (Stream A). Warm parchment / charcoal palette from
// tailwind.config.js; serif headings, sans body. Every interactive element is
// a real button/input with a visible focus ring.
import { useEffect, useRef, type ReactNode } from 'react'
import { cn, formatRelativeTime } from '../lib/utils'
import { useAppStore } from '../state/store'

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'gold'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-oxblood text-white hover:bg-oxblood-light focus-visible:outline-gold',
  outline:
    'border border-ink/25 bg-transparent text-ink hover:border-oxblood hover:text-oxblood dark:border-parchment/30 dark:text-parchment dark:hover:border-gold-light dark:hover:text-gold-light',
  ghost: 'bg-transparent text-ink-soft hover:bg-ink/5 dark:text-parchment/80 dark:hover:bg-parchment/10',
  danger: 'bg-transparent border border-oxblood text-oxblood hover:bg-oxblood hover:text-white',
  gold: 'bg-gold text-white hover:bg-gold-light',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-sm font-medium text-ink dark:text-parchment">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint dark:text-parchment/60">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs font-medium text-oxblood dark:text-red-300">
          {error}
        </span>
      )}
    </label>
  )
}

const inputClass =
  'w-full rounded-md border border-ink/25 bg-white/70 px-3 py-2 text-sm text-ink placeholder:text-ink-faint/70 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold dark:border-parchment/25 dark:bg-charcoal-card dark:text-parchment dark:placeholder:text-parchment/40'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, 'min-h-24 resize-y leading-relaxed')} {...props} />
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, 'cursor-pointer')} {...props}>
      {children}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Modal / dialog
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    dialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'max-h-[85vh] w-full overflow-y-auto rounded-lg bg-parchment-card p-6 shadow-xl dark:bg-charcoal-card',
          wide ? 'max-w-2xl' : 'max-w-lg',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-serif text-xl font-semibold text-ink dark:text-parchment">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-ink-soft hover:bg-ink/5 dark:text-parchment/70 dark:hover:bg-parchment/10"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 text-sm leading-relaxed text-ink-soft dark:text-parchment/80">{children}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'gold' | 'oxblood' | 'muted' }) {
  const tones = {
    default: 'bg-ink/10 text-ink dark:bg-parchment/15 dark:text-parchment',
    gold: 'bg-gold/15 text-gold dark:bg-gold/25 dark:text-gold-light',
    oxblood: 'bg-oxblood/10 text-oxblood dark:bg-oxblood/30 dark:text-red-200',
    muted: 'bg-ink/5 text-ink-faint dark:bg-parchment/10 dark:text-parchment/60',
  } as const
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-ink/25 bg-parchment-card/60 px-6 py-10 text-center dark:border-parchment/25 dark:bg-charcoal-card/60">
      <p className="font-serif text-lg font-semibold text-ink dark:text-parchment">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft dark:text-parchment/70">{children}</div>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  )
}

/**
 * Save status, announced politely to screen readers. Reads the store, so any
 * component using useAutosave updates this automatically.
 */
export function SaveIndicator() {
  const saveStatus = useAppStore((s) => s.saveStatus)
  const lastSavedAt = useAppStore((s) => s.lastSavedAt)
  const saveError = useAppStore((s) => s.saveError)
  const label =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'error'
        ? `Save failed${saveError ? `: ${saveError}` : ''}`
        : saveStatus === 'saved' && lastSavedAt
          ? `Saved ${formatRelativeTime(lastSavedAt)}`
          : 'All changes saved'
  return (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        saveStatus === 'error' ? 'font-medium text-oxblood dark:text-red-300' : 'text-ink-faint dark:text-parchment/60',
      )}
      title={label}
    >
      <span aria-hidden="true" className={cn('inline-block h-2 w-2 rounded-full', saveStatus === 'saving' ? 'animate-pulse bg-gold' : saveStatus === 'error' ? 'bg-oxblood' : 'bg-green-700/70 dark:bg-green-400/70')} />
      {label}
    </span>
  )
}

/** One-line shortcut chip, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-ink/25 bg-white/70 px-1.5 py-0.5 font-sans text-[11px] text-ink-soft dark:border-parchment/30 dark:bg-charcoal-panel dark:text-parchment/80">
      {children}
    </kbd>
  )
}
