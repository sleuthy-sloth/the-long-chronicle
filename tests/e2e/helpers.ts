// Stream D — shared e2e helpers. All data below is invented placeholder
// content written for these specs (no rulebook text, no example prompts).
import { expect, type Page } from '@playwright/test'

export const E2E_WORD = 'quillwick'

export async function appLoaded(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Chronicles' }).first()).toBeVisible()
}

/** Wipe the app's IndexedDB so each test starts from an empty archive. */
export async function clearDatabase(page: Page) {
  await page.goto('about:blank')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('long-chronicle')
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
        req.onblocked = () => reject(new Error('deleteDatabase blocked — a connection is still open'))
      }),
  )
  await appLoaded(page)
}

export async function createChronicle(page: Page, title: string, vampire = 'E2E Vampire') {
  await page.goto('/chronicles')
  await page.getByRole('button', { name: '+ New chronicle' }).click()
  await page.getByLabel('Chronicle title').fill(title)
  await page.getByLabel('Vampire name').fill(vampire)
  await page.getByLabel('Starting era').fill('late 14th century')
  await page.getByLabel('Starting location').fill('E2E Town')
  await page.getByLabel('Concept').fill('Sample concept: an e2e test vampire.')
  await page.getByRole('button', { name: 'Create chronicle', exact: true }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

export async function createMemory(page: Page, index: number) {
  await page.goto('/memories')
  await page.getByRole('button', { name: 'Record a memory' }).click()
  await page.locator('#mem-title').fill(`E2E memory ${index}`)
  await page.locator('#mem-text').fill(`Sample memory ${index}: the smell of ${E2E_WORD} rain on stone.`)
  await page.getByRole('button', { name: 'Save memory' }).click()
  await expect(page.getByRole('tab', { name: new RegExp(`^All \\(${index}\\)`) })).toBeVisible()
}

/** The "All (n)" status tab text on /memories, parsed to a number. */
export async function memoryCount(page: Page): Promise<number> {
  const text = (await page.getByRole('tab', { name: /^All \(\d+\)$/ }).textContent()) ?? ''
  const match = /All \((\d+)\)/.exec(text)
  return match ? Number(match[1]) : -1
}
