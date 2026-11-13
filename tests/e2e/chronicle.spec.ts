// Stream D — chronicle lifecycle e2e specs (against the production preview).
//
// Covers: create persists after reload; 10 memories; lose one (still in Lost
// view); alter one (both versions visible); journal entry linking a memory;
// resource history; search finds entry + memory; second-chronicle isolation;
// keyboard navigation; Cmd/Ctrl+K opens search.
//
// Known gaps, stated plainly instead of faked:
// - The journal-entry save navigates after save; the spec re-opens the entry
//   to assert the link.
// - The read-only journal view does not render linked people/places, so the
//   person/place-linking spec asserts the link on the person and place
//   detail pages, which list the entries that name them.
import { expect, test } from '@playwright/test'
import { E2E_WORD, appLoaded, clearDatabase, createChronicle, createMemory, memoryCount } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearDatabase(page)
})

test('create chronicle persists after reload', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle One')
  await page.reload()
  await page.goto('/chronicles')
  await expect(page.getByRole('heading', { name: 'E2E Chronicle One' })).toBeVisible()
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()
})

test('add 10 memories', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle Memories')
  for (let i = 1; i <= 10; i++) {
    await createMemory(page, i)
  }
  await expect(await memoryCount(page)).toBe(10)
})

test('lose one memory — it stays in the Lost view', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle Loss')
  await createMemory(page, 1)
  await createMemory(page, 2)
  await page.getByRole('link', { name: /E2E memory 1/ }).first().click()
  await page.getByRole('button', { name: 'Mark as lost', exact: true }).click()
  // The dialog's confirm button shares the label; take the one in the dialog.
  await page.getByRole('button', { name: 'Mark as lost', exact: true }).last().click()
  await expect(page.getByText('Lost', { exact: true }).first()).toBeVisible()
  await page.goto('/memories')
  await page.getByRole('tab', { name: /^Lost \(\d+\)$/ }).click()
  await expect(page.getByRole('link', { name: /E2E memory 1/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /E2E memory 2/ })).toHaveCount(0)
})

test('alter one memory — old and new wording are both visible', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle Alter')
  await createMemory(page, 1)
  await page.getByRole('link', { name: /E2E memory 1/ }).first().click()
  await page.getByRole('button', { name: 'Alter wording' }).click()
  await page.getByLabel('New wording').fill(`Sample memory (altered): the smell of ${E2E_WORD} rain on stone, misremembered.`)
  await page.getByRole('button', { name: 'Save altered version' }).click()
  await expect(page.getByRole('heading', { name: 'Version & status history' })).toBeVisible()
  await expect(page.getByText(/Version 1/)).toBeVisible()
  await expect(page.getByText(/misremembered/)).toBeVisible()
  await expect(page.getByText(new RegExp(`Sample memory 1: the smell of ${E2E_WORD} rain`))).toBeVisible()
})

test('journal entry links a memory and a new thread', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle Journal')
  await createMemory(page, 1)
  await page.goto('/journal/new')
  await page.getByLabel('Title').fill('E2E entry one')
  await page.getByLabel('Date / era').fill('late 14th century')
  await page.getByLabel('Journal entry body (Markdown supported)').fill(`Sample journal: the ${E2E_WORD} rain began.`)
  // Link the memory (Step 4 checkboxes) and add a thread inline.
  await page.getByLabel(/E2E memory 1/).check()
  await page.getByLabel('New unresolved thread').fill('E2E thread: the rain debt')
  await page.getByRole('button', { name: 'Add thread', exact: true }).click()
  await page.getByRole('button', { name: 'Save new entry' }).click()
  await expect(page.getByRole('link', { name: 'E2E entry one' }).first()).toBeVisible()
  await page.getByRole('link', { name: 'E2E entry one' }).first().click()
  await expect(page.getByText(/E2E memory 1/)).toBeVisible()
})

test('resource history records an added resource', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle Character')
  await page.goto('/character')
  await page.getByRole('button', { name: '+ Add resource' }).click()
  await page.getByLabel('Name').first().fill('E2E brass key')
  await page.getByLabel('Quantity (optional)').fill('1')
  await page.getByRole('button', { name: 'Add resource', exact: true }).click()
  await expect(page.getByText('E2E brass key').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Change history' })).toBeVisible()
  await expect(page.getByText(/E2E brass key/).last()).toBeVisible()
})

test('search finds the journal entry and the memory', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle Search')
  await createMemory(page, 1)
  await page.goto('/journal/new')
  await page.getByLabel('Title').fill('E2E search entry')
  await page.getByLabel('Journal entry body (Markdown supported)').fill(`Sample journal: ${E2E_WORD} rain again.`)
  await page.getByRole('button', { name: 'Save new entry' }).click()
  await page.keyboard.press('Control+K')
  const search = page.getByLabel('Search the chronicle')
  await expect(search).toBeVisible()
  await search.fill(E2E_WORD)
  const listbox = page.getByRole('listbox', { name: 'Search results' })
  await expect(listbox.getByText(/E2E memory 1/)).toBeVisible()
  await expect(listbox.getByText(/E2E search entry/)).toBeVisible()
})

test('second chronicle is isolated from the first', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle A')
  await createMemory(page, 1)
  await createMemory(page, 2)
  await createChronicle(page, 'E2E Chronicle B')
  await page.goto('/memories')
  await expect(await memoryCount(page)).toBe(0)
  await page.goto('/chronicles')
  await page.getByRole('button', { name: 'Make active' }).first().click()
  await page.goto('/memories')
  await expect(await memoryCount(page)).toBe(2)
})

test('keyboard: Tab reaches the main navigation', async ({ page }) => {
  await appLoaded(page)
  await page.keyboard.press('Tab')
  // Tab through the header until a navigation link is focused (max 20 stops).
  let focused = ''
  for (let i = 0; i < 20; i++) {
    focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? `${el.tagName}:${el.textContent?.trim().slice(0, 30) ?? ''}` : ''
    })
    if (focused.startsWith('A:') && /Dashboard|Chronicles|Memories|Journal|Settings/.test(focused)) break
    await page.keyboard.press('Tab')
  }
  expect(focused).toMatch(/^A:(Dashboard|Chronicles|Current Character|Memories|Journal|Timeline|People|Archive|Settings)/)
})

test('Cmd/Ctrl+K opens global search', async ({ page }) => {
  await appLoaded(page)
  await page.keyboard.press('Control+K')
  await expect(page.getByLabel('Search the chronicle')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Search the chronicle')).toHaveCount(0)
})

test('approximate-date timeline event', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle Timeline')
  await page.goto('/timeline')
  await page.getByRole('button', { name: 'Add event…' }).click()
  await page.getByLabel('Title').fill('E2E mill fire')
  await page.getByLabel('Era (free text)').fill('late 14th century')
  // Leave the sort year blank: an approximate date keeps entry order and
  // is never forced into an exact calendar year.
  await page.getByLabel('Description').fill('Sample event: the mill by the river burned.')
  await page.getByRole('button', { name: 'Add to timeline', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E2E mill fire' })).toBeVisible()
  await expect(page.getByText('late 14th century')).toBeVisible()
  // No exact year was attached to the event.
  await expect(page.locator('ol').getByText(/year \d+/)).toHaveCount(0)
})

test('journal entry links a person and a place', async ({ page }) => {
  await createChronicle(page, 'E2E Chronicle People')
  // Create a person and a place first: the journal editor can only link
  // records that exist.
  await page.goto('/people')
  await page.getByRole('button', { name: 'Add person…' }).click()
  await page.getByLabel('Name').fill('E2E Aunt Maren')
  await page.getByRole('button', { name: 'Add person', exact: true }).click()
  await expect(page.getByRole('link', { name: 'E2E Aunt Maren' })).toBeVisible()
  await page.goto('/places')
  await page.getByRole('button', { name: 'Add place…' }).click()
  await page.getByLabel('Name').fill('E2E Dunmere mill')
  await page.getByRole('button', { name: 'Add place', exact: true }).click()
  await expect(page.getByRole('link', { name: 'E2E Dunmere mill' })).toBeVisible()
  // Link both in a new journal entry.
  await page.goto('/journal/new')
  await page.getByLabel('Title').fill('E2E entry two')
  await page.getByLabel('Date / era').fill('late 14th century')
  await page.getByLabel('Journal entry body (Markdown supported)').fill(`Sample journal: met ${E2E_WORD} at the mill.`)
  await page.getByLabel(/E2E Aunt Maren/).check()
  await page.getByLabel(/E2E Dunmere mill/).check()
  await page.getByRole('button', { name: 'Save new entry' }).click()
  await expect(page.getByRole('link', { name: 'E2E entry two' }).first()).toBeVisible()
  // The link surfaces on each detail page, which lists the entries naming it.
  await page.goto('/people')
  await page.getByRole('link', { name: 'E2E Aunt Maren' }).click()
  await expect(page.getByRole('link', { name: /E2E entry two/ })).toBeVisible()
  await page.goto('/places')
  await page.getByRole('link', { name: 'E2E Dunmere mill' }).click()
  await expect(page.getByRole('link', { name: /E2E entry two/ })).toBeVisible()
})
