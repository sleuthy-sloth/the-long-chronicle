// Pre-warm Playwright's transform cache (scripts/prewarm-playwright-cache.mjs).
//
// WHY: this sandbox rejects single write() syscalls larger than ~4096 bytes,
// and Playwright writes each transformed test file to its cache with one
// writeFileSync — so `npx playwright test` dies in the transform hook.
// Playwright SKIPS the write entirely when the cache file already exists
// with matching content, so this script computes exactly the cache entries
// Playwright would compute (same babel transform, same sha1 scheme) and
// writes them with 2048-byte chunks, which the sandbox permits.
//
// Run after any edit to a spec/config file, before `npx playwright test`:
//   node scripts/prewarm-playwright-cache.mjs
//   NODE_OPTIONS='--import scripts/chunked-fs.mjs' npx playwright test
// (The chunked-fs preload is still needed for anything Playwright writes at
// runtime, e.g. test-results and traces. Start `vite preview` separately —
// Playwright's webServer spawn hits the same write limit on vite's config
// bundling; see playwright.config.ts.)
import { createHash } from 'node:crypto'
import { mkdirSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { libPath, packageJSON } = require(join(ROOT, 'node_modules/playwright/lib/package.js'))
const { babelTransform } = require(libPath('transform', 'babelBundle'))

const CHUNK = 2048
const VERSION = packageJSON.version // e.g. '1.65.0'
const USE_DEFINE_FOR_CLASS_FIELDS = true // tsconfig.json
// NB: Playwright's validateTsConfig turns tsconfig "jsx" into an OBJECT
// ({ jsx, jsxFactory, jsxFragmentFactory, jsxImportSource }); both the
// hash and babelTransform take that object, NOT the bare string.
const JSX = { jsx: 'react-jsx' } // tsconfig.json
const FILES = [
  'playwright.config.ts',
  'tests/e2e/helpers.ts',
  'tests/e2e/chronicle.spec.ts',
  'tests/e2e/export-import.spec.ts',
  'tests/e2e/pwa.spec.ts',
]

const cacheDir =
  process.env.PLAYWRIGHT_TRANSFORM_CACHE_DIR ||
  process.env.PWTEST_CACHE_DIR ||
  join('/tmp', `playwright-transform-cache-${process.geteuid?.() ?? 0}`)

function sha1(text) {
  return createHash('sha1').update(text).digest('hex')
}

function writeChunked(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  const buf = Buffer.from(data, 'utf8')
  const fd = openSync(path, 'w')
  try {
    let offset = 0
    while (offset < buf.length) {
      const end = Math.min(offset + CHUNK, buf.length)
      offset += writeSync(fd, buf, offset, end - offset)
    }
  } finally {
    closeSync(fd)
  }
}

for (const rel of FILES) {
  const filePath = join(ROOT, rel)
  const content = readFileSync(filePath, 'utf8')
  // Mirror Playwright's calculateHash (lib/common/index.js).
  const contentHash = createHash('sha1')
    .update('esm')
    .update(content)
    .update(filePath)
    .update(VERSION)
    .update('')
    .update(USE_DEFINE_FOR_CLASS_FIELDS ? 'define' : 'assign')
    .update(JSON.stringify(JSX))
    .digest('hex')
  const filePathHash = sha1(filePath).substring(0, 10)
  const hashPrefix = `${filePathHash}_${contentHash.substring(0, 7)}`
  const cacheFolderName = filePathHash.substring(0, 2)
  const base = basename(filePath, extname(filePath)).replace(/\W/g, '')
  const cachePath = join(cacheDir, cacheFolderName, `${hashPrefix}_${base}`)
  const { code, map } = babelTransform(content, filePath, true, [], USE_DEFINE_FOR_CLASS_FIELDS, JSX)
  if (!code) throw new Error(`babelTransform returned no code for ${rel}`)
  writeChunked(`${cachePath}.js`, `// ${sha1(code)}\n${code}`)
  if (map) writeChunked(`${cachePath}.map`, JSON.stringify(map))
  console.log(`warmed ${rel} -> ${cachePath}.js (${code.length} bytes)`)
}
console.log(`cache dir: ${cacheDir}`)
