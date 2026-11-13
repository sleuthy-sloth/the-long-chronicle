// Stream D — minimal client-side ZIP writer (STORE only, no compression lib).
//
// Why hand-rolled: the app is offline-first and dependency-light, and the
// Markdown export only needs a valid .zip container. Files are stored
// uncompressed (method 0), which keeps the writer small and the output easy
// to verify. `parseZip` is the matching reader used by the unit tests to
// prove a round-trip; it is not a general-purpose unzipper.
export interface ZipEntryInput {
  /** Path inside the zip, e.g. "Journal/001-first-night.md". Forward slashes. */
  name: string
  data: Uint8Array | string
  mtime?: Date
}

export interface ZipEntryOutput {
  name: string
  data: Uint8Array
}

// CRC-32 (IEEE 802.3) table, built once.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f)
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f)
  return { time, date: dosDate }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, value, true)
  return out
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value >>> 0, true)
  return out
}

/** Build a valid .zip (STORE) from the given files. Throws on duplicate names. */
export function createZip(entries: ZipEntryInput[]): Uint8Array {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new Error(`Duplicate file in zip: "${entry.name}"`)
    seen.add(entry.name)
  }

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const dataBytes = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data
    const crc = crc32(dataBytes)
    const { time, date } = dosDateTime(entry.mtime ?? new Date())
    // Bit 11: filename is UTF-8. Method 0 = stored.
    const flags = 0x0800

    const localHeader = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed to extract
      u16(flags),
      u16(0), // method: store
      u16(time),
      u16(date),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0), // extra field length
      nameBytes,
    ])
    localParts.push(localHeader, dataBytes)

    centralParts.push(
      concat([
        u32(0x02014b50), // central directory signature
        u16(20), // version made by
        u16(20), // version needed to extract
        u16(flags),
        u16(0),
        u16(time),
        u16(date),
        u32(crc),
        u32(dataBytes.length),
        u32(dataBytes.length),
        u16(nameBytes.length),
        u16(0), // extra field length
        u16(0), // comment length
        u16(0), // disk number start
        u16(0), // internal attributes
        u32(0), // external attributes
        u32(offset), // local header offset
        nameBytes,
      ]),
    )
    offset += localHeader.length + dataBytes.length
  }

  const central = concat(centralParts)
  const end = concat([
    u32(0x06054b50), // end of central directory signature
    u16(0), // disk number
    u16(0), // central directory disk
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0), // comment length
  ])
  return concat([...localParts, central, end])
}

/** Read back a zip produced by createZip (STORE entries only). Verifies CRCs. */
export function parseZip(bytes: Uint8Array): ZipEntryOutput[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: ZipEntryOutput[] = []
  let offset = 0
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true)
    if (signature === 0x02014b50 || signature === 0x06054b50) break // central dir / end
    if (signature !== 0x04034b50) {
      throw new Error(`Invalid zip: expected a local file header at offset ${offset}.`)
    }
    const method = view.getUint16(offset + 8, true)
    if (method !== 0) throw new Error(`Unsupported zip entry: compression method ${method} (only stored entries are supported).`)
    const crc = view.getUint32(offset + 14, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    const data = bytes.slice(dataStart, dataStart + compressedSize)
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in zip entry "${name}".`)
    entries.push({ name, data })
    offset = dataStart + compressedSize
  }
  if (entries.length === 0) throw new Error('Invalid zip: no entries found.')
  return entries
}
