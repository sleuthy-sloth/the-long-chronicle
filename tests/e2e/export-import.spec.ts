// Stream D — export / import / offline e2e specs (against production preview).
//
// Export / import all live in the single data surface, <DataTools />
// (src/components/DataTools.tsx), mounted on the Settings page (/settings):
// JSON backup, Markdown export, single-record exports, and the import
// flow with validation + preview (import-as-new by default, replace only
// with explicit confirmation).
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clearDatabase, createChronicle, createMemory } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearDatabase(page)
})

test('JSON export → clear DB → import round-trip, counts match', async ({ page }, testInfo) => {
  await createChronicle(page, 'E2E Round Trip')
  await createMemory(page, 1)
  await createMemory(page, 2)
  await page.goto('/journal/new')
  await page.getByLabel('Title').fill('E2E round-trip entry')
  await page.getByLabel('Journal entry body (Markdown supported)').fill('Sample journal: round-trip entry.')
  await page.getByRole('button', { name: 'Save new entry' }).click()
  await expect(page.getByRole('link', { name: 'E2E round-trip entry' })).toBeVisible()

  // Export.
  await page.goto('/settings')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON backup' }).click()
  const download = await downloadPromise
  const backupPath = join(testInfo.outputDir, download.suggestedFilename())
  await download.saveAs(backupPath)
  const backup = JSON.parse(readFileSync(backupPath, 'utf-8')) as {
    schemaVersion: number
    memories: unknown[]
    journal: unknown[]
    chronicle: { title: string }
  }
  expect(backup.schemaVersion).toBe(1)
  expect(backup.memories).toHaveLength(2)
  expect(backup.journal).toHaveLength(1)
  expect(backup.chronicle.title).toBe('E2E Round Trip')

  // Wipe the local database, then import the file back.
  await clearDatabase(page)
  await page.goto('/settings')
  await page.getByLabel('Backup file (.json)').setInputFiles(backupPath)
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible()
  await expect(page.getByText('E2E Round Trip')).toBeVisible()
  await page.getByRole('button', { name: 'Import as a new chronicle' }).click()
  await expect(page.getByRole('status').first()).toContainText(/Imported/)

  // Record counts match the backup.
  await page.goto('/chronicles')
  await expect(page.getByRole('heading', { name: 'E2E Round Trip' })).toBeVisible()
  await page.goto('/memories')
  await expect(page.getByRole('tab', { name: /^All \(2\)$/ })).toBeVisible()
  await page.goto('/journal')
  await expect(page.getByRole('link', { name: 'E2E round-trip entry' })).toBeVisible()
})

test('offline: app loads and lists data with the network off', async ({ page, context }) => {
  await createChronicle(page, 'E2E Offline')
  await createMemory(page, 1)
  // Let the service worker take control before going offline.
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15_000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Chronicles' }).first()).toBeVisible()
  await page.goto('/chronicles')
  await expect(page.getByRole('heading', { name: 'E2E Offline' })).toBeVisible()
  await page.goto('/memories')
  await expect(page.getByRole('tab', { name: /^All \(1\)$/ })).toBeVisible()
  await context.setOffline(false)
})
