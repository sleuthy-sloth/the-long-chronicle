// @vitest-environment node
// Stream D tests: hand-rolled STORE zip writer + reader round-trip.
import { describe, expect, it } from 'vitest'
import { createZip, crc32, parseZip } from '../src/lib/zip'

const decoder = new TextDecoder()

describe('zip writer', () => {
  it('round-trips files, including a unicode name and an empty file', () => {
    const bytes = createZip([
      { name: 'Chronicle Overview.md', data: '# The Ashen Archive\n' },
      { name: 'Journal/001-first-night.md', data: 'Sample journal: rain on stone.' },
      { name: 'Journal/002-ünïcode.md', data: 'Sample: unicode filename.' },
      { name: 'empty.txt', data: '' },
    ])
    const entries = parseZip(bytes)
    expect(entries.map((e) => e.name)).toEqual([
      'Chronicle Overview.md',
      'Journal/001-first-night.md',
      'Journal/002-ünïcode.md',
      'empty.txt',
    ])
    expect(decoder.decode(entries[1].data)).toBe('Sample journal: rain on stone.')
    expect(entries[3].data.length).toBe(0)
  })

  it('stores bytes exactly (no compression mangling)', () => {
    const binary = new Uint8Array([0, 1, 2, 250, 255, 128, 64])
    const entries = parseZip(createZip([{ name: 'bin.dat', data: binary }]))
    expect(entries[0].data).toEqual(binary)
    expect(crc32(binary)).toBeGreaterThan(0)
  })

  it('rejects duplicate names', () => {
    expect(() => createZip([
      { name: 'a.txt', data: 'one' },
      { name: 'a.txt', data: 'two' },
    ])).toThrow(/Duplicate file/)
  })

  it('rejects garbage and detects a corrupted entry', () => {
    expect(() => parseZip(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/Invalid zip/)
    expect(() => parseZip(new Uint8Array(0))).toThrow(/Invalid zip/)
    const bytes = createZip([{ name: 'a.txt', data: 'hello' }])
    // Corrupt one byte of the stored file data (local header is 30 bytes +
    // the 5-byte name, so data starts at offset 35).
    const corrupted = bytes.slice()
    corrupted[35] = corrupted[35] === 0x68 ? 0x69 : 0x68
    expect(() => parseZip(corrupted)).toThrow(/CRC mismatch/)
  })
})
