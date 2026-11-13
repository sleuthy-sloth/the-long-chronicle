// Stream D — PWA + responsive-layout e2e specs (against production preview).
import { expect, test } from '@playwright/test'
import { appLoaded } from './helpers'

test('manifest, icons, favicon and service worker are served', async ({ page, request }) => {
  const manifestRes = await request.get('/manifest.webmanifest')
  expect(manifestRes.ok()).toBe(true)
  const manifest = (await manifestRes.json()) as {
    name: string
    short_name: string
    display: string
    icons: { src: string; sizes: string; type: string }[]
  }
  expect(manifest.name).toBe('The Long Chronicle')
  expect(manifest.short_name).toBe('Chronicle')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons).toHaveLength(3)
  for (const icon of manifest.icons) {
    const res = await request.get(`/${icon.src}`)
    expect(res.ok()).toBe(true)
    expect(res.headers()['content-type']).toContain('image/png')
  }
  expect((await request.get('/favicon.svg')).ok()).toBe(true)
  expect((await request.get('/sw.js')).ok()).toBe(true)

  await appLoaded(page)
  const html = await page.content()
  expect(html).toContain('manifest.webmanifest')
  const registration = await page.evaluate(() => navigator.serviceWorker?.getRegistration().then((r) => Boolean(r)))
  expect(registration).toBe(true)
})

test('exactly one main navigation is visible at this viewport', async ({ page }) => {
  await appLoaded(page)
  const visibleNavs = page.locator('nav[aria-label="Main"]:visible')
  await expect(visibleNavs).toHaveCount(1)
  const width = page.viewportSize()?.width ?? 0
  if (width >= 768) {
    await expect(page.getByRole('link', { name: 'Settings & Data' })).toBeVisible()
  } else {
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible()
  }
})
