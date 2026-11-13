// @vitest-environment node
// Feature 6 tests: attachments CRUD, the 5 MB cap, total bytes, and the
// backup / duplicate paths — export→import round-trips the bytes intact,
// duplicate remaps attachment recordIds, and corrupt base64 is skipped
// gracefully instead of killing the import. All content below is invented
// placeholder text written for these tests.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, duplicateChronicle, resetDb } from '../src/db/database'
import { buildExport, collectChronicleData, getDb } from '../src/lib/export'
import { applyImport, parseImportFile, previewImport } from '../src/lib/import'
import {
  MAX_ATTACHMENT_BYTES,
  addAttachment,
  attachmentFromExport,
  attachmentToExport,
  attachmentsTotalBytes,
  createAttachmentObjectUrl,
  deleteAttachment,
  downloadAttachment,
  formatAttachmentSize,
  getAttachment,
  isImageMimeType,
  isValidBase64,
  listAttachments,
  revokeAttachmentObjectUrl,
} from '../src/lib/attachments'
import { seedTestChronicle } from './seed-chronicle'

beforeEach(async () => {
  await resetDb()
})

function textFile(name: string, text: string, type = 'text/plain'): File {
  return new File([text], name, { type })
}

function bytesFile(name: string, bytes: number[], type = 'application/octet-stream'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

async function blobBytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

function bytesToBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('attachments CRUD', () => {
  it('adds, lists, and fetches attachments on a record', async () => {
    const seed = await seedTestChronicle()
    const chronicleId = seed.chronicle.id
    const image = await addAttachment(
      chronicleId, 'memory', seed.memoryActiveId,
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'mill-sketch.png', { type: 'image/png' }),
    )
    const note = await addAttachment(chronicleId, 'memory', seed.memoryActiveId, textFile('mill-note.txt', 'Sample note: the mill door sticks in the rain.'))
    expect(image.fileName).toBe('mill-sketch.png')
    expect(image.mimeType).toBe('image/png')
    expect(image.sizeBytes).toBe(4)
    expect(image.recordType).toBe('memory')
    expect(image.recordId).toBe(seed.memoryActiveId)
    expect(image.chronicleId).toBe(chronicleId)

    const listed = await listAttachments(chronicleId, 'memory', seed.memoryActiveId)
    expect(listed).toHaveLength(2)
    expect(listed.map((a) => a.fileName)).toEqual(['mill-sketch.png', 'mill-note.txt'])
    // Other records and other record types do not leak in.
    expect(await listAttachments(chronicleId, 'memory', seed.memoryLostId)).toHaveLength(0)
    expect(await listAttachments(chronicleId, 'person', seed.memoryActiveId)).toHaveLength(0)

    const fetched = await getAttachment(note.id)
    expect(fetched?.fileName).toBe('mill-note.txt')
    expect(await blobBytes(fetched!.data)).toEqual([...new TextEncoder().encode('Sample note: the mill door sticks in the rain.')])
    expect(await getAttachment('no-such-id')).toBeUndefined()
  })

  it('stores a bare Blob as "attachment" with a fallback mime type', async () => {
    const seed = await seedTestChronicle()
    const row = await addAttachment(
      seed.chronicle.id, 'person', seed.personId,
      new Blob(['sample bytes with no name'], { type: '' }),
    )
    expect(row.fileName).toBe('attachment')
    expect(row.mimeType).toBe('application/octet-stream')
  })

  it('deletes an attachment and only that attachment', async () => {
    const seed = await seedTestChronicle()
    const keep = await addAttachment(seed.chronicle.id, 'place', seed.placeId, textFile('keep.txt', 'Sample kept file.'))
    const drop = await addAttachment(seed.chronicle.id, 'place', seed.placeId, textFile('drop.txt', 'Sample dropped file.'))
    await deleteAttachment(drop.id)
    expect(await getAttachment(drop.id)).toBeUndefined()
    expect(await listAttachments(seed.chronicle.id, 'place', seed.placeId)).toHaveLength(1)
    expect((await listAttachments(seed.chronicle.id, 'place', seed.placeId))[0].id).toBe(keep.id)
    // Deleting a missing id is a no-op, not an error.
    await deleteAttachment('no-such-id')
  })

  it('refuses files over 5 MB with a plain-language error, and accepts exactly 5 MB', async () => {
    const seed = await seedTestChronicle()
    const tooBig = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'too-big.bin', { type: 'application/octet-stream' })
    await expect(
      addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, tooBig),
    ).rejects.toThrow(/5 MB/)
    expect(await listAttachments(seed.chronicle.id, 'memory', seed.memoryActiveId)).toHaveLength(0)

    const exact = new File([new Uint8Array(MAX_ATTACHMENT_BYTES)], 'exactly-5mb.bin', { type: 'application/octet-stream' })
    const row = await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, exact)
    expect(row.sizeBytes).toBe(MAX_ATTACHMENT_BYTES)
  })

  it('sums total bytes per chronicle, and counts nothing for an empty one', async () => {
    const seed = await seedTestChronicle()
    const other = await seedTestChronicle()
    expect(await attachmentsTotalBytes(seed.chronicle.id)).toBe(0)
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, textFile('a.txt', '12345'))
    await addAttachment(seed.chronicle.id, 'person', seed.personId, bytesFile('b.bin', [1, 2, 3]))
    await addAttachment(other.chronicle.id, 'memory', other.memoryActiveId, textFile('c.txt', '1234567890'))
    expect(await attachmentsTotalBytes(seed.chronicle.id)).toBe(8)
    expect(await attachmentsTotalBytes(other.chronicle.id)).toBe(10)
  })
})

describe('attachment helpers (pure)', () => {
  it('classifies image mime types for previews', () => {
    expect(isImageMimeType('image/png')).toBe(true)
    expect(isImageMimeType('image/jpeg')).toBe(true)
    expect(isImageMimeType('image/svg+xml')).toBe(true)
    expect(isImageMimeType('IMAGE/PNG')).toBe(true)
    expect(isImageMimeType('application/pdf')).toBe(false)
    expect(isImageMimeType('text/html')).toBe(false)
    expect(isImageMimeType('text/plain')).toBe(false)
    expect(isImageMimeType('')).toBe(false)
  })

  it('formats byte counts', () => {
    expect(formatAttachmentSize(0)).toBe('0 B')
    expect(formatAttachmentSize(812)).toBe('812 B')
    expect(formatAttachmentSize(1024)).toBe('1 KB')
    expect(formatAttachmentSize(2048)).toBe('2 KB')
    expect(formatAttachmentSize(1536)).toBe('1.5 KB')
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatAttachmentSize(2_621_440)).toBe('2.5 MB')
  })

  it('validates base64 strictly', () => {
    expect(isValidBase64('aGVsbG8=')).toBe(true)
    expect(isValidBase64('')).toBe(true)
    expect(isValidBase64('!!!not-base64!!!')).toBe(false)
    expect(isValidBase64('aGVsbG8')).toBe(false) // missing padding
    expect(isValidBase64('aGVs bG8=')).toBe(false) // whitespace
    expect(isValidBase64(42)).toBe(false)
    expect(isValidBase64(null)).toBe(false)
  })

  it('round-trips the export shape, recomputing size from the decoded bytes', async () => {
    const seed = await seedTestChronicle()
    const row = await addAttachment(
      seed.chronicle.id, 'journalEntry', seed.entryOneId,
      bytesFile('all-bytes.bin', Array.from({ length: 256 }, (_, i) => i)),
    )
    const exported = await attachmentToExport(row)
    expect(exported.dataBase64).toBe(bytesToBase64(Array.from({ length: 256 }, (_, i) => i)))
    expect(exported.sizeBytes).toBe(256)
    // A lying sizeBytes in the backup is corrected on restore.
    const restored = await attachmentFromExport({ ...exported, sizeBytes: 999 })
    expect(restored.sizeBytes).toBe(256)
    expect(await blobBytes(restored.data)).toEqual(Array.from({ length: 256 }, (_, i) => i))
    expect(restored.fileName).toBe('all-bytes.bin')
    await expect(attachmentFromExport({ ...exported, dataBase64: '!!!' })).rejects.toThrow(/not valid base64/)
  })

  it('builds and revokes object URLs; download returns the bytes and name', async () => {
    const seed = await seedTestChronicle()
    const row = await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, textFile('hello.txt', 'Sample download content.'))
    const url = createAttachmentObjectUrl(row.data)
    expect(url.startsWith('blob:')).toBe(true)
    expect(() => revokeAttachmentObjectUrl(url)).not.toThrow()

    const dl = await downloadAttachment(row.id)
    expect(dl?.fileName).toBe('hello.txt')
    expect(dl?.mimeType).toBe('text/plain')
    expect(dl?.url.startsWith('blob:')).toBe(true)
    expect(await blobBytes(dl!.blob)).toEqual([...new TextEncoder().encode('Sample download content.')])
    revokeAttachmentObjectUrl(dl!.url)
    expect(await downloadAttachment('no-such-id')).toBeUndefined()
  })
})

describe('attachments in backup / import / duplicate', () => {
  it('export→import round-trips the bytes intact and remaps recordIds', async () => {
    const seed = await seedTestChronicle()
    const allBytes = Array.from({ length: 256 }, (_, i) => i)
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, bytesFile('all-bytes.bin', allBytes))
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, textFile('rain-note.txt', 'Sample note: rain on stone.'))
    await addAttachment(seed.chronicle.id, 'person', seed.personId, textFile('miller-note.txt', 'Sample note: the miller keeps a ledger.'))

    const backup = await buildExport(getDb(), seed.chronicle.id)
    expect(backup.attachments).toHaveLength(3)
    // The backup is plain JSON — no Blobs survive stringification.
    const json = JSON.stringify(backup)
    expect(json).not.toContain('[object Blob]')
    expect(JSON.parse(json).attachments[0].dataBase64).toBeTruthy()

    await resetDb()
    const parsed = parseImportFile(json)
    const result = await applyImport(getDb(), parsed)
    expect(result.mode).toBe('new')
    const restored = await collectChronicleData(getDb(), result.chronicleId)
    expect(restored.attachments).toHaveLength(3)

    // Bytes identical, by content. (collectChronicleData returns the backup
    // shape, so bytes are checked through dataBase64 and a decode.)
    const binary = restored.attachments.find((a) => a.fileName === 'all-bytes.bin')!
    expect(binary.dataBase64).toBe(bytesToBase64(allBytes))
    expect(await blobBytes((await attachmentFromExport(binary)).data)).toEqual(allBytes)
    expect(binary.mimeType).toBe('application/octet-stream')
    const rainNote = restored.attachments.find((a) => a.fileName === 'rain-note.txt')!
    expect(await blobBytes((await attachmentFromExport(rainNote)).data)).toEqual([...new TextEncoder().encode('Sample note: rain on stone.')])
    // And the rows actually stored in IndexedDB hold real Blobs, not strings.
    const storedBinary = await db.attachments.get(binary.id)
    expect(storedBinary).toBeDefined()
    expect(storedBinary!.data).toBeInstanceOf(Blob)
    expect(await blobBytes(storedBinary!.data)).toEqual(allBytes)

    // RecordIds point at the imported records, never the originals.
    const newMemory = restored.memories.find((m) => m.title === 'Rain on stone')!
    expect(binary.recordId).toBe(newMemory.id)
    expect(binary.recordId).not.toBe(seed.memoryActiveId)
    const newPerson = restored.people.find((p) => p.name === 'Anselm the miller')!
    const millerNote = restored.attachments.find((a) => a.fileName === 'miller-note.txt')!
    expect(millerNote.recordId).toBe(newPerson.id)
    expect(millerNote.recordId).not.toBe(seed.personId)
    // No attachment in the copy points at any original id.
    const originalIds = new Set([
      seed.memoryActiveId, seed.memoryLostId, seed.memoryAlteredId,
      seed.entryOneId, seed.entryTwoId, seed.personId, seed.placeId, seed.threadId,
    ])
    for (const a of restored.attachments) {
      expect(originalIds.has(a.recordId)).toBe(false)
      expect(originalIds.has(a.id)).toBe(false)
    }
  })

  it('overwrite import replaces attachments with the backup set', async () => {
    const seed = await seedTestChronicle()
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, textFile('old.txt', 'Sample old file.'))
    const backup = await buildExport(getDb(), seed.chronicle.id)
    // Add a second file after the backup, then replace from the backup.
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, textFile('extra.txt', 'Sample extra file.'))
    expect((await db.attachments.toArray())).toHaveLength(2)
    const parsed = parseImportFile(JSON.stringify(backup))
    const result = await applyImport(getDb(), parsed, { mode: 'overwrite', confirmOverwrite: true })
    expect(result.mode).toBe('overwrite')
    const after = await collectChronicleData(getDb(), seed.chronicle.id)
    expect(after.attachments).toHaveLength(1)
    expect(after.attachments[0].fileName).toBe('old.txt')
    expect(await blobBytes((await attachmentFromExport(after.attachments[0])).data)).toEqual([...new TextEncoder().encode('Sample old file.')])
  })

  it('duplicate remaps attachment recordIds to the copied records', async () => {
    const seed = await seedTestChronicle()
    const bytes = [9, 8, 7, 6, 5]
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, bytesFile('copy-me.bin', bytes))
    await addAttachment(seed.chronicle.id, 'journalEntry', seed.entryOneId, textFile('entry-note.txt', 'Sample note on entry one.'))

    const copy = await duplicateChronicle(seed.chronicle.id)
    expect(copy.id).not.toBe(seed.chronicle.id)
    const copied = await collectChronicleData(getDb(), copy.id)
    expect(copied.attachments).toHaveLength(2)

    const copyMemory = copied.memories.find((m) => m.title === 'Rain on stone')!
    const copyEntry = copied.journal.find((e) => e.number === 1)!
    const copiedBinary = copied.attachments.find((a) => a.fileName === 'copy-me.bin')!
    expect(copiedBinary.recordId).toBe(copyMemory.id)
    expect(copiedBinary.recordId).not.toBe(seed.memoryActiveId)
    expect(await blobBytes((await attachmentFromExport(copiedBinary)).data)).toEqual(bytes)
    const copiedNote = copied.attachments.find((a) => a.fileName === 'entry-note.txt')!
    expect(copiedNote.recordId).toBe(copyEntry.id)
    expect(copiedNote.recordId).not.toBe(seed.entryOneId)

    // The original is untouched: its attachments still point at its records.
    const original = await collectChronicleData(getDb(), seed.chronicle.id)
    expect(original.attachments).toHaveLength(2)
    expect(original.attachments.find((a) => a.fileName === 'copy-me.bin')?.recordId).toBe(seed.memoryActiveId)
    // Deleting the copy's attachment does not touch the original.
    await deleteAttachment(copiedBinary.id)
    expect((await collectChronicleData(getDb(), seed.chronicle.id)).attachments).toHaveLength(2)
  })

  it('import skips corrupt attachment data gracefully and warns about it', async () => {
    const seed = await seedTestChronicle()
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, textFile('good.txt', 'Sample good file.'))
    await addAttachment(seed.chronicle.id, 'memory', seed.memoryActiveId, textFile('doomed.txt', 'Sample doomed file.'))
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const tampered = JSON.parse(JSON.stringify(backup)) as Record<string, unknown>
    const attachments = tampered.attachments as Record<string, unknown>[]
    // Corrupt base64 in the 'doomed.txt' row, and add a second row missing its file name.
    const doomed = attachments.find((a) => a.fileName === 'doomed.txt')!
    doomed.dataBase64 = '!!!not-base64!!!'
    attachments.push({
      id: 'made-up-id', chronicleId: seed.chronicle.id, recordType: 'memory',
      recordId: seed.memoryActiveId, mimeType: 'text/plain', sizeBytes: 5,
      dataBase64: 'aGVsbG8=', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })

    const parsed = parseImportFile(JSON.stringify(tampered))
    expect(parsed.attachments).toHaveLength(1)
    expect(parsed.attachments[0].fileName).toBe('good.txt')
    expect(parsed.skippedAttachments).toHaveLength(2)
    expect(parsed.skippedAttachments!.map((s) => s.fileName)).toContain('doomed.txt')
    expect(parsed.skippedAttachments!.map((s) => s.fileName)).toContain('(unnamed file)')

    const preview = await previewImport(parsed, getDb())
    expect(preview.counts['Attachments']).toBe(1)
    expect(preview.warnings.join(' ')).toMatch(/corrupt file data/)
    expect(preview.warnings.join(' ')).toMatch(/doomed\.txt/)

    await resetDb()
    const result = await applyImport(getDb(), parsed)
    const restored = await collectChronicleData(getDb(), result.chronicleId)
    // The good attachment and every other record still import.
    expect(restored.attachments).toHaveLength(1)
    expect(restored.attachments[0].fileName).toBe('good.txt')
    expect(await blobBytes((await attachmentFromExport(restored.attachments[0])).data)).toEqual([...new TextEncoder().encode('Sample good file.')])
    expect(restored.memories).toHaveLength(3)
    expect(restored.journal).toHaveLength(2)
  })

  it('a backup with no attachments field still imports (backwards compatible)', async () => {
    const seed = await seedTestChronicle()
    const backup = await buildExport(getDb(), seed.chronicle.id)
    const oldStyle = JSON.parse(JSON.stringify(backup)) as Record<string, unknown>
    delete oldStyle.attachments
    const parsed = parseImportFile(JSON.stringify(oldStyle))
    expect(parsed.attachments).toEqual([])
    await resetDb()
    const result = await applyImport(getDb(), parsed)
    const restored = await collectChronicleData(getDb(), result.chronicleId)
    expect(restored.attachments).toEqual([])
    expect(restored.memories).toHaveLength(3)
  })
})
