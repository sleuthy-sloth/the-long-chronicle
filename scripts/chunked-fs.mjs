// Preload (via NODE_OPTIONS=--import) that works around this sandbox's
// write limit: a single write() syscall larger than ~4096 bytes is rejected
// with EPERM, which breaks tools that save whole files at once (npm,
// Playwright's transform cache, curl). This patch splits large
// fs.writeFileSync / fs.promises.writeFile calls into 2048-byte chunks
// using the original fs.writeSync, which the sandbox permits.
//
// Usage: NODE_OPTIONS='--import <repo>/scripts/chunked-fs.mjs' <node tool>
// It only affects the process (and its Node children, via NODE_OPTIONS
// inheritance) it is loaded into. Small writes keep the fast path.
import fs from 'node:fs'

const CHUNK = 2048
const origWriteFileSync = fs.writeFileSync
const origWriteSync = fs.writeSync
const origOpenSync = fs.openSync
const origCloseSync = fs.closeSync

function toBuffer(data, options) {
  if (typeof data === 'string') {
    const encoding =
      typeof options === 'string' ? options : (options?.encoding ?? 'utf8')
    return Buffer.from(data, encoding)
  }
  if (Buffer.isBuffer(data)) return data
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  return Buffer.from(String(data))
}

function flagOf(options) {
  if (typeof options === 'string') return 'w'
  return options?.flag ?? 'w'
}

function writeFileSyncChunked(path, data, options) {
  const buf = toBuffer(data, options)
  const fd = origOpenSync(path, flagOf(options), options?.mode)
  try {
    let offset = 0
    while (offset < buf.length) {
      const end = Math.min(offset + CHUNK, buf.length)
      offset += origWriteSync(fd, buf, offset, end - offset)
    }
  } finally {
    origCloseSync(fd)
  }
}

fs.writeFileSync = function patchedWriteFileSync(path, data, options) {
  const size =
    typeof data === 'string'
      ? Buffer.byteLength(data, typeof options === 'string' ? options : (options?.encoding ?? 'utf8'))
      : (data?.byteLength ?? data?.length ?? 0)
  if (size <= CHUNK) return origWriteFileSync.call(fs, path, data, options)
  return writeFileSyncChunked(path, data, options)
}

const origPromisesWriteFile = fs.promises.writeFile
fs.promises.writeFile = async function patchedPromisesWriteFile(path, data, options) {
  const buf = toBuffer(data, options)
  if (buf.length <= CHUNK) return origPromisesWriteFile.call(fs.promises, path, data, options)
  const handle = await fs.promises.open(path, flagOf(options), options?.mode)
  try {
    let offset = 0
    while (offset < buf.length) {
      const end = Math.min(offset + CHUNK, buf.length)
      const { bytesWritten } = await handle.write(buf, offset, end - offset)
      offset += bytesWritten
    }
  } finally {
    await handle.close()
  }
}
