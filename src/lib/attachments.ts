// Feature 6 — Attachments.
//
// Files attached to a memory, journal entry, person, or place. The bytes live
// in IndexedDB as a Blob on the `attachments` table (Dexie v2); backups carry
// them as base64 (see src/lib/export.ts `AttachmentExport`).
//
// Security: uploaded files are the user's own data, but they are never
// rendered as code — images preview through object URLs only for image/*
// mime types, everything else is download-only, and no user file is ever
// injected with dangerouslySetInnerHTML or an iframe/object/embed (see
// src/components/AttachmentList.tsx).
import { db } from '../db/database'
import { attachmentSchema } from '../db/validation'
import { newId, nowIso } from '../db/types'
import type { Attachment, ID } from '../db/types'
import type { AttachmentExport } from './export'

export type AttachmentRecordType = Attachment['recordType']

/** Per-file size cap: files larger than this are refused with a plain error. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const MAX_ATTACHMENT_SIZE_LABEL = '5 MB'

/** True for image/* mime types — the only files ever shown as a preview. */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith('image/')
}

/** Human-readable byte count: "812 B", "12 KB", "3.4 MB". */
export function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return '0 B'
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) {
    const kb = sizeBytes / 1024
    return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`
  }
  const mb = sizeBytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
}

// --- base64 (pure helpers; btoa/atob exist in browsers and in Node) ---

/** Bytes → base64, chunked so large files never blow the call stack. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** base64 → bytes. Throws on malformed input — callers check isValidBase64 first. */
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Strict base64 check: legal characters, correct padding, and a clean
 * decode/re-encode round-trip. Anything else is corrupt data, not a file.
 */
export function isValidBase64(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value === '') return true
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false
  return bytesToBase64(base64ToBytes(value)) === value
}

// --- backup shape ------------------------------------------------------------

/** A stored attachment as it appears in a JSON backup: bytes as base64. */
export async function attachmentToExport(attachment: Attachment): Promise<AttachmentExport> {
  const bytes = new Uint8Array(await attachment.data.arrayBuffer())
  return {
    id: attachment.id,
    chronicleId: attachment.chronicleId,
    recordType: attachment.recordType,
    recordId: attachment.recordId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.data.size,
    dataBase64: bytesToBase64(bytes),
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  }
}

/**
 * Restore a stored attachment from a backup row. The byte count is recomputed
 * from the decoded bytes — the backup's sizeBytes is never trusted.
 * Throws a plain Error when the base64 does not decode cleanly.
 */
export async function attachmentFromExport(row: AttachmentExport): Promise<Attachment> {
  if (!isValidBase64(row.dataBase64)) {
    throw new Error(
      `Attachment "${row.fileName}" has file data that is not valid base64, so it was skipped.`,
    )
  }
  const bytes = base64ToBytes(row.dataBase64)
  const blob = new Blob([bytes], { type: row.mimeType })
  return attachmentSchema.parse({
    id: row.id,
    chronicleId: row.chronicleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    recordType: row.recordType,
    recordId: row.recordId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: blob.size,
    data: blob,
  })
}

// --- CRUD --------------------------------------------------------------------

/**
 * Store one file on a record. Files over 5 MB are refused with a
 * plain-language error; nothing is written. A bare Blob (no file name) is
 * stored as "attachment".
 */
export async function addAttachment(
  chronicleId: ID,
  recordType: AttachmentRecordType,
  recordId: ID,
  file: File | Blob,
): Promise<Attachment> {
  const sizeBytes = file.size
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `That file is ${formatAttachmentSize(sizeBytes)}, which is over the ${MAX_ATTACHMENT_SIZE_LABEL} limit for a single attachment. Pick a smaller file.`,
    )
  }
  const now = nowIso()
  const fileName = (file instanceof File && file.name ? file.name : '') || 'attachment'
  const mimeType = file.type || 'application/octet-stream'
  const record = attachmentSchema.parse({
    id: newId(),
    chronicleId,
    createdAt: now,
    updatedAt: now,
    recordType,
    recordId,
    fileName: fileName.slice(0, 255),
    mimeType: mimeType.slice(0, 200),
    sizeBytes,
    data: file,
  })
  await db.attachments.put(record)
  return record
}

/** Every attachment on one record, oldest first. */
export async function listAttachments(
  chronicleId: ID,
  recordType: AttachmentRecordType,
  recordId: ID,
): Promise<Attachment[]> {
  const rows = await db.attachments
    .where('chronicleId')
    .equals(chronicleId)
    .filter((a) => a.recordType === recordType && a.recordId === recordId)
    .toArray()
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function getAttachment(id: ID): Promise<Attachment | undefined> {
  return db.attachments.get(id)
}

export async function deleteAttachment(id: ID): Promise<void> {
  await db.attachments.delete(id)
}

/** Total bytes of every attachment in a chronicle — for the Settings display. */
export async function attachmentsTotalBytes(chronicleId: ID): Promise<number> {
  const rows = await db.attachments.where('chronicleId').equals(chronicleId).toArray()
  return rows.reduce((sum, a) => sum + (a.sizeBytes || 0), 0)
}

/** How many attachments a chronicle has — for the Settings display. */
export async function attachmentsCount(chronicleId: ID): Promise<number> {
  return db.attachments.where('chronicleId').equals(chronicleId).count()
}

// --- object URLs (previews + downloads) ---------------------------------------

/**
 * Build a blob: URL for an attachment's bytes (image previews, downloads).
 * Throws a plain Error where object URLs are unavailable — callers show the
 * message instead of a broken preview.
 */
export function createAttachmentObjectUrl(data: Blob): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('File previews are not available in this environment.')
  }
  return URL.createObjectURL(data)
}

export function revokeAttachmentObjectUrl(url: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

/**
 * Everything the UI needs to download one attachment: the bytes, the name to
 * save under, and a blob: URL the UI can hand to an anchor. The caller owns
 * the URL and must revoke it (revokeAttachmentObjectUrl) after the download
 * starts. Returns undefined when the attachment does not exist.
 */
export async function downloadAttachment(
  id: ID,
): Promise<{ blob: Blob; fileName: string; mimeType: string; url: string } | undefined> {
  const row = await getAttachment(id)
  if (!row) return undefined
  return {
    blob: row.data,
    fileName: row.fileName,
    mimeType: row.mimeType,
    url: createAttachmentObjectUrl(row.data),
  }
}
