// Feature 6 — attachment list for one record (memory, journal entry,
// person, or place): file picker, image previews, download, remove.
//
// Security: image previews render through blob: object URLs ONLY for image/*
// mime types. Non-image files are download-only. File names are rendered as
// text (React escapes them) — never as HTML — and no user file is ever put
// in an iframe, object, or embed element. SVG previews go through <img>,
// where SVG cannot run scripts.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment } from '../db/types'
import {
  addAttachment,
  createAttachmentObjectUrl,
  deleteAttachment,
  downloadAttachment,
  formatAttachmentSize,
  isImageMimeType,
  listAttachments,
  revokeAttachmentObjectUrl,
  MAX_ATTACHMENT_SIZE_LABEL,
  type AttachmentRecordType,
} from '../lib/attachments'

export interface AttachmentListProps {
  chronicleId: string
  recordType: AttachmentRecordType
  recordId: string
}

export default function AttachmentList({ chronicleId, recordType, recordId }: AttachmentListProps) {
  const [rows, setRows] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const urlsRef = useRef<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const revokeAll = useCallback(() => {
    for (const url of Object.values(urlsRef.current)) revokeAttachmentObjectUrl(url)
    urlsRef.current = {}
    setPreviewUrls({})
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listAttachments(chronicleId, recordType, recordId)
      revokeAll()
      const urls: Record<string, string> = {}
      for (const row of list) {
        if (isImageMimeType(row.mimeType)) {
          try {
            urls[row.id] = createAttachmentObjectUrl(row.data)
          } catch {
            // Preview unavailable in this environment; the row still lists
            // and downloads normally.
          }
        }
      }
      urlsRef.current = urls
      setPreviewUrls(urls)
      setRows(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load attachments.')
    } finally {
      setLoading(false)
    }
  }, [chronicleId, recordType, recordId, revokeAll])

  useEffect(() => {
    void reload()
    return () => revokeAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setNotice(null)
    setUploading(true)
    const failures: string[] = []
    let added = 0
    for (const file of Array.from(files)) {
      try {
        await addAttachment(chronicleId, recordType, recordId, file)
        added += 1
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'could not be attached'}`)
      }
    }
    // Reset so picking the same file again still fires a change.
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
    if (failures.length > 0) setError(failures.join(' '))
    if (added > 0) setNotice(added === 1 ? 'Attachment added.' : `${added} attachments added.`)
    await reload()
  }

  async function handleDownload(row: Attachment) {
    setError(null)
    try {
      const dl = await downloadAttachment(row.id)
      if (!dl) {
        setError('That attachment is no longer there.')
        await reload()
        return
      }
      const anchor = document.createElement('a')
      anchor.href = dl.url
      anchor.download = dl.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => revokeAttachmentObjectUrl(dl.url), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download did not work.')
    }
  }

  async function handleRemove(row: Attachment) {
    setError(null)
    try {
      await deleteAttachment(row.id)
      if (urlsRef.current[row.id]) {
        revokeAttachmentObjectUrl(urlsRef.current[row.id])
        delete urlsRef.current[row.id]
      }
      setConfirmDeleteId(null)
      setNotice(`“${row.fileName}” removed.`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that attachment.')
    }
  }

  return (
    <section aria-labelledby="attachments-heading" className="mt-6">
      <h2 id="attachments-heading" className="font-serif text-xl">Attachments</h2>
      <p className="mt-1 text-sm text-ink-soft dark:text-parchment/80">
        Files stay on this device with the chronicle, and travel with it in a JSON backup.
        Each file must be {MAX_ATTACHMENT_SIZE_LABEL} or smaller.
      </p>

      {error && <p role="alert" className="mt-3 rounded border border-oxblood bg-oxblood/10 p-3 text-sm font-semibold text-oxblood">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded border border-gold bg-gold/10 p-3 text-sm font-semibold">{notice}</p>}

      <div className="mt-3">
        <label className="inline-block cursor-pointer rounded border border-ink/30 px-4 py-2 text-sm font-semibold">
          {uploading ? 'Adding…' : 'Add a file…'}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-ink-soft dark:text-parchment/80">Loading attachments…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft dark:text-parchment/80">No files attached yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => {
            const previewUrl = previewUrls[row.id]
            const confirming = confirmDeleteId === row.id
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-ink/15 bg-parchment-card p-3 dark:border-gold/20 dark:bg-charcoal-card"
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`Preview of ${row.fileName}`}
                    className="h-20 w-20 shrink-0 rounded border border-ink/15 object-cover dark:border-gold/20"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-ink/15 bg-parchment-deep text-2xl dark:border-gold/20 dark:bg-charcoal-panel"
                  >
                    📄
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">{row.fileName}</p>
                  <p className="mt-0.5 text-xs text-ink-faint dark:text-parchment/60">
                    {formatAttachmentSize(row.sizeBytes)}
                    {isImageMimeType(row.mimeType) ? '' : ` · ${row.mimeType}`}
                    {` · added ${new Date(row.createdAt).toLocaleDateString()}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDownload(row)}
                      className="rounded border border-ink/30 px-3 py-1 text-sm font-semibold"
                    >
                      Download
                    </button>
                    {confirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleRemove(row)}
                          className="rounded bg-oxblood px-3 py-1 text-sm font-semibold text-white"
                        >
                          Confirm remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded border border-ink/30 px-3 py-1 text-sm font-semibold"
                        >
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(row.id)}
                        className="rounded border border-ink/30 px-3 py-1 text-sm font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
