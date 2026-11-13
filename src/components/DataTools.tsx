// Stream D — DataTools: the single data-management surface (backup /
// restore UI: JSON + Markdown). Mounted in src/pages/Settings.tsx; the
// Settings page itself keeps only theme, editor preferences, keyboard
// shortcuts, and the privacy note — there is no second export/import shell
// anywhere. It talks to the database only through the Stream D lib (getDb()
// adapter over Stream A's canonical Dexie instance) and the app store
// (active chronicle, refresh after import).
//
// Accessibility: semantic sections + fieldset/legend, labelled controls,
// errors in role="alert", status in an aria-live region with a text prefix
// ("Success:" / "Error:") so state is never carried by colour alone.
import { useCallback, useEffect, useRef, useState } from 'react'
import { APP } from '../config/app'
import { useAppStore } from '../state/store'
import {
  collectChronicleData,
  daysSinceLastExport,
  downloadFile,
  downloadJsonBackup,
  downloadSingleExport,
  exportFileName,
  getDb,
  slugify,
  type ChronicleDbLike,
} from '../lib/export'
import {
  ImportError,
  applyImport,
  parseImportFile,
  previewImport,
  type ImportPreview,
} from '../lib/import'
import { buildCombinedMarkdown, buildMarkdownFiles } from '../lib/markdownExport'
import { downloadBookHtml } from '../lib/bookExport'
import { attachmentsCount, attachmentsTotalBytes, formatAttachmentSize } from '../lib/attachments'
import { createZip } from '../lib/zip'
import { formatDateTime } from '../lib/utils'
import { Badge } from './ui'
import type { ChronicleExport } from '../lib/export'
import type { JournalEntry } from '../db/types'

export interface DataToolsProps {
  /** Defaults to the active chronicle from the store. */
  chronicleId?: string | null
  /** Called with the new chronicle id after a successful import. */
  onImported?: (chronicleId: string) => void
  /** Test seam — defaults to the shared database. */
  db?: ChronicleDbLike
}

const BACKUP_REMINDER_DAYS = 14

export default function DataTools({ chronicleId: chronicleIdProp, onImported, db: dbProp }: DataToolsProps) {
  const activeChronicle = useAppStore((s) => s.activeChronicle)
  const settingsLastExport = useAppStore((s) => s.settings.lastExportAt)
  const refreshChronicles = useAppStore((s) => s.refreshChronicles)
  const db = dbProp ?? getDb()
  const chronicleId = chronicleIdProp ?? activeChronicle?.id ?? null

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState('')
  const [importFileName, setImportFileName] = useState('')
  const [importData, setImportData] = useState<ChronicleExport | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importMode, setImportMode] = useState<'new' | 'overwrite'>('new')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [storage, setStorage] = useState<{ usedMB: string; quotaMB: string } | null>(null)
  const [attachmentStorage, setAttachmentStorage] = useState<{ count: number; bytes: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const lastExportAt = activeChronicle?.lastExportAt ?? settingsLastExport ?? null
  const daysSince = daysSinceLastExport(lastExportAt)

  useEffect(() => {
    if (navigator.storage?.estimate) {
      void navigator.storage.estimate().then((est) => {
        if (est.usage != null) {
          setStorage({
            usedMB: (est.usage / 1_048_576).toFixed(1),
            quotaMB: est.quota ? (est.quota / 1_048_576).toFixed(0) : 'unknown',
          })
        }
      })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!chronicleId) {
      setJournalEntries([])
      return
    }
    void collectChronicleData(db, chronicleId)
      .then((data) => {
        if (!cancelled) setJournalEntries(data.journal)
      })
      .catch(() => {
        if (!cancelled) setJournalEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [chronicleId, db])

  // Attachments storage is a snapshot read at mount / chronicle change; it
  // does not live-update when a file is added on a detail page.
  useEffect(() => {
    if (!chronicleId) {
      setAttachmentStorage(null)
      return
    }
    let cancelled = false
    void Promise.all([attachmentsCount(chronicleId), attachmentsTotalBytes(chronicleId)]).then(([count, bytes]) => {
      if (!cancelled) setAttachmentStorage({ count, bytes })
    })
    return () => {
      cancelled = true
    }
  }, [chronicleId])

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      setBusy(true)
      setError('')
      try {
        const message = await fn()
        setStatus(`Success: ${message}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong.'
        setError(message)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const handleJsonBackup = () =>
    run('JSON backup', async () => {
      if (!chronicleId) throw new Error('No chronicle is open to back up.')
      const backup = await downloadJsonBackup(db, chronicleId)
      await refreshChronicles()
      return `JSON backup downloaded (${backup.journal.length} journal entries, ${backup.memories.length} memories). Backup time recorded.`
    })

  const handleMarkdownZip = () =>
    run('Markdown export', async () => {
      if (!chronicleId) throw new Error('No chronicle is open to export.')
      const data = await collectChronicleData(db, chronicleId)
      const files = buildMarkdownFiles(data)
      const zip = createZip(Object.entries(files).map(([name, text]) => ({ name, data: text })))
      downloadFile(exportFileName(data.chronicle, 'markdown', 'zip'), new Blob([zip as BlobPart], { type: 'application/zip' }), 'application/zip')
      return `Markdown .zip downloaded (${Object.keys(files).length} files).`
    })

  const handleCombinedMarkdown = () =>
    run('Markdown export', async () => {
      if (!chronicleId) throw new Error('No chronicle is open to export.')
      const data = await collectChronicleData(db, chronicleId)
      const text = buildCombinedMarkdown(data)
      downloadFile(exportFileName(data.chronicle, 'chronicle', 'md'), text, 'text/markdown')
      return 'Combined Markdown file downloaded.'
    })

  const handleBookHtml = () =>
    run('Book export', async () => {
      if (!chronicleId) throw new Error('No chronicle is open to export.')
      await downloadBookHtml(db, chronicleId)
      return 'Book (.html) downloaded — one self-contained file, readable offline.'
    })

  const handleSingleExport = (kind: 'memories' | 'characterSheet' | 'timeline') =>
    run('Export', async () => {
      if (!chronicleId) throw new Error('No chronicle is open to export.')
      await downloadSingleExport(db, kind, chronicleId)
      return 'Downloaded.'
    })

  const handleEntryExport = () =>
    run('Export', async () => {
      if (!selectedEntryId) throw new Error('Choose a journal entry first.')
      await downloadSingleExport(db, 'journalEntry', selectedEntryId)
      return 'Journal entry downloaded.'
    })

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setStatus('')
    setImportData(null)
    setImportPreview(null)
    setImportFileName(file.name)
    try {
      const text = await file.text()
      const parsed = parseImportFile(text)
      const preview = await previewImport(parsed, db)
      setImportData(parsed)
      setImportPreview(preview)
      setImportMode('new')
      setConfirmReplace(false)
    } catch (err) {
      if (err instanceof ImportError) {
        setError(err.details.length > 0 ? `${err.message} ${err.details.join(' ')}` : err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Could not read that file.')
      }
    }
  }

  const handleApplyImport = () =>
    run('Import', async () => {
      if (!importData) throw new Error('Choose a backup file first.')
      const result = await applyImport(db, importData, {
        mode: importMode,
        confirmOverwrite: confirmReplace,
      })
      setImportData(null)
      setImportPreview(null)
      setImportFileName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await refreshChronicles()
      onImported?.(result.chronicleId)
      return result.mode === 'new'
        ? `Imported "${result.chronicleTitle}" as a new chronicle (${result.counts['Journal entries'] ?? 0} journal entries, ${result.counts['Memories'] ?? 0} memories).`
        : `Replaced the chronicle with the backup of "${result.chronicleTitle}".`
    })

  const reminder =
    !chronicleId
      ? 'No chronicle is open yet.'
      : daysSince === null
        ? 'No backup yet — export a JSON backup so a lost device does not lose this chronicle.'
        : daysSince >= BACKUP_REMINDER_DAYS
          ? `Last backup was ${daysSince} days ago — consider exporting a fresh backup.`
          : `Last backup ${daysSince === 0 ? 'today' : `${daysSince} day${daysSince === 1 ? '' : 's'} ago`}.`

  return (
    <section aria-labelledby="data-tools-heading" className="rounded-lg border border-gold/40 bg-parchment-card p-5 dark:border-gold/25 dark:bg-charcoal-card">
      <h2 id="data-tools-heading" className="font-serif text-2xl">Data &amp; backup</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-parchment/80">
        Everything lives in this browser&rsquo;s local database — no account, no server, no analytics, no AI, no
        cloud. That also means the browser is <strong>not a permanent backup</strong>: clearing site data, an
        uninstalled PWA, or a lost device takes the chronicle with it. Export is your responsibility, and your
        safety net.
      </p>
      <p role="status" className="mt-2 text-sm">
        {reminder}
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium">Last export:</dt>
          <dd>
            {lastExportAt ? (
              <>
                {formatDateTime(lastExportAt)}{' '}
                {daysSince !== null && (
                  <Badge tone={daysSince > 30 ? 'oxblood' : daysSince > 7 ? 'gold' : 'muted'}>
                    {daysSince === 0 ? 'today' : `${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago`}
                  </Badge>
                )}
              </>
            ) : (
              'Never — no backup exists yet.'
            )}
          </dd>
        </div>
        {storage && (
          <div className="flex gap-2">
            <dt className="font-medium">Local storage used:</dt>
            <dd>
              {storage.usedMB} MB of ~{storage.quotaMB} MB available
            </dd>
          </div>
        )}
        {attachmentStorage && (
          <div className="flex gap-2">
            <dt className="font-medium">Attachments in this chronicle:</dt>
            <dd>
              {attachmentStorage.count} file{attachmentStorage.count === 1 ? '' : 's'}, {formatAttachmentSize(attachmentStorage.bytes)} of local storage
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="font-medium">App version:</dt>
          <dd>{APP.version}</dd>
        </div>
      </dl>

      {error && (
        <p role="alert" className="mt-3 rounded border border-oxblood/60 bg-oxblood/5 p-3 text-sm font-semibold text-oxblood dark:text-red-300">
          Error: {error}
        </p>
      )}
      {status && (
        <p aria-live="polite" className="mt-3 rounded border border-gold/60 bg-gold/10 p-3 text-sm">
          {status}
        </p>
      )}

      <h3 className="mt-5 font-serif text-xl">Export</h3>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
        Exports are files on your device — nothing is uploaded anywhere. JSON backups restore
        fully (backups include attached files); Markdown is for reading and printing. The book
        export is the whole chronicle as one printable .html file.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void handleJsonBackup()} disabled={busy || !chronicleId} className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Download JSON backup
        </button>
        <button type="button" onClick={() => void handleMarkdownZip()} disabled={busy || !chronicleId} className="rounded border border-oxblood px-4 py-2 text-sm font-semibold text-oxblood dark:text-red-300 disabled:opacity-50">
          Download Markdown (.zip)
        </button>
        <button type="button" onClick={() => void handleCombinedMarkdown()} disabled={busy || !chronicleId} className="rounded border border-oxblood px-4 py-2 text-sm font-semibold text-oxblood dark:text-red-300 disabled:opacity-50">
          Download Markdown (single file)
        </button>
        <button type="button" onClick={() => void handleBookHtml()} disabled={busy || !chronicleId} className="rounded border border-oxblood px-4 py-2 text-sm font-semibold text-oxblood dark:text-red-300 disabled:opacity-50">
          Download book (.html)
        </button>
      </div>

      <h3 className="mt-5 font-serif text-xl">Single-record exports</h3>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => void handleSingleExport('memories')} disabled={busy || !chronicleId} className="rounded border border-ink/30 px-3 py-2 text-sm disabled:opacity-50">
          All memories (.json)
        </button>
        <button type="button" onClick={() => void handleSingleExport('characterSheet')} disabled={busy || !chronicleId} className="rounded border border-ink/30 px-3 py-2 text-sm disabled:opacity-50">
          Character sheet (.json)
        </button>
        <button type="button" onClick={() => void handleSingleExport('timeline')} disabled={busy || !chronicleId} className="rounded border border-ink/30 px-3 py-2 text-sm disabled:opacity-50">
          Timeline (.json)
        </button>
        <div>
          <label htmlFor="data-tools-entry" className="block text-sm font-semibold">Journal entry</label>
          <select
            id="data-tools-entry"
            value={selectedEntryId}
            onChange={(e) => setSelectedEntryId(e.target.value)}
            disabled={busy || journalEntries.length === 0}
            className="mt-1 rounded border border-ink/25 bg-white/70 p-2 text-sm dark:border-gold/30 dark:bg-charcoal-panel"
          >
            <option value="">Choose an entry…</option>
            {journalEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                Entry {entry.number} — {entry.title}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => void handleEntryExport()} disabled={busy || !selectedEntryId} className="rounded border border-ink/30 px-3 py-2 text-sm disabled:opacity-50">
          Export entry (.json)
        </button>
      </div>

      <h3 className="mt-6 font-serif text-xl">Import a backup</h3>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
        The file is checked before anything is written. A bad file changes nothing.
      </p>
      <div className="mt-3">
        <label htmlFor="data-tools-import-file" className="block text-sm font-semibold">Backup file (.json)</label>
        <input
          ref={fileInputRef}
          id="data-tools-import-file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => void handleImportFile(e.target.files?.[0])}
          className="mt-1 block w-full text-sm"
        />
        {importFileName && <p className="mt-1 text-sm">Selected: {importFileName}</p>}
      </div>

      {importPreview && importData && (
        <div className="mt-4 rounded border border-gold/40 p-4">
          <h4 className="font-serif text-lg">Import preview</h4>
          <p className="mt-1 text-sm">
            Chronicle: <strong>{importPreview.chronicleTitle}</strong> ({importPreview.vampireName}), exported{' '}
            {new Date(importPreview.exportedAt).toLocaleDateString()}. {importPreview.totalRecords} records in total.
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {Object.entries(importPreview.counts).map(([label, count]) => (
              <li key={label} className="flex justify-between gap-2">
                <span>{label}</span>
                <span className="font-semibold">{count}</span>
              </li>
            ))}
          </ul>
          {importPreview.warnings.map((warning) => (
            <p key={warning} role="note" className="mt-2 text-sm font-semibold text-oxblood dark:text-red-300">
              Warning: {warning}
            </p>
          ))}
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold">How should this backup be imported?</legend>
            <label className="mt-1 flex items-start gap-2 text-sm">
              <input type="radio" name="import-mode" checked={importMode === 'new'} onChange={() => setImportMode('new')} />
              <span>Import as a new chronicle (recommended — fresh ids, all links remapped, nothing overwritten)</span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="radio" name="import-mode" checked={importMode === 'overwrite'} onChange={() => setImportMode('overwrite')} />
              <span>Replace the existing chronicle with this backup (deletes the current copy first)</span>
            </label>
          </fieldset>
          {importMode === 'overwrite' && (
            <label className="mt-3 flex items-start gap-2 text-sm font-semibold">
              <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
              <span>I understand this will delete the existing chronicle&apos;s data and replace it with the backup.</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => void handleApplyImport()}
            disabled={busy || (importMode === 'overwrite' && !confirmReplace)}
            className="mt-4 rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {importMode === 'new' ? 'Import as a new chronicle' : 'Replace chronicle with backup'}
          </button>
        </div>
      )}
      <p className="mt-4 text-xs text-ink-soft dark:text-parchment/70">
        Filenames include the chronicle title and date, e.g. {activeChronicle ? `${slugify(activeChronicle.title)}-backup-2026-11-13.json` : 'my-chronicle-backup-2026-11-13.json'}.
        Keep backups somewhere safe — there is no server copy to recover from.
      </p>
    </section>
  )
}
