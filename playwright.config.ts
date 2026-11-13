// Stream D — Playwright config.
//
// Runs against `vite preview` (production build). Build first, then test:
//   npm run build && npx playwright test
// The webServer below starts preview automatically when it is not already
// running; `npm run build` is NOT run here, so a stale dist/ will be tested
// if you skip the build step.
// Browsers: chromium is cached in ~/.cache/ms-playwright in this sandbox.
// If browsers are missing elsewhere, run `npx playwright install chromium`.
// Projects: desktop Chromium (1280x800) and a phone-width Chromium
// (iPhone 13 viewport/user-agent) — the same Chromium engine in both.
//
// SANDBOX NOTE (this dev VM only): the VM rejects single write() calls
// larger than ~4096 bytes, which breaks Playwright's transform-cache writes
// and vite's config bundling under Playwright's webServer spawn. On this VM:
//   1. node scripts/prewarm-playwright-cache.mjs   (or npm run prewarm:e2e)
//   2. start preview yourself: vite preview --port 4173 --host 127.0.0.1
//   3. NODE_OPTIONS='--import ./scripts/chunked-fs.mjs' npx playwright test
// Re-run step 1 after any edit to a spec or to this config. Elsewhere,
// plain `npx playwright test` works as usual.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'chromium-phone',
      // devices['iPhone 13'] defaults to WebKit; pin Chromium so this
      // project runs with only `npx playwright install chromium`, as the
      // header comment promises ("the same Chromium engine in both").
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  webServer: {
    // Vite directly, not `npm run preview`: npm fails in this sandbox
    // (its log-file write exceeds the ~4096-byte single-write limit).
    command: './node_modules/.bin/vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
