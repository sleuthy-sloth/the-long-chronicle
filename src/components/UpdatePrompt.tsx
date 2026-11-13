// Stream D — UpdatePrompt: non-blocking "new version ready" banner.
//
// The service worker is registered with registerType 'autoUpdate' (see
// vite.config.ts), so a new version installs in the background; this banner
// only asks the player to reload to pick it up. It is deliberately quiet:
// no modal, no forced reload, dismissible, and silent entirely when the PWA
// runtime is unavailable (e.g. unit tests, non-HTTPS preview).
//
// Stream A should mount this once, near the app root (e.g. in Layout), so
// it can appear on any page.
import { useEffect, useState } from 'react'

export default function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateServiceWorker, setUpdateServiceWorker] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return
        const updateSW = registerSW({
          onNeedRefresh() {
            setNeedRefresh(true)
          },
          onRegisteredSW(_swUrl, registration) {
            // Check for a new version about once an hour while the app is open.
            if (registration) {
              window.setInterval(() => {
                void registration.update()
              }, 60 * 60 * 1000)
            }
          },
        })
        setUpdateServiceWorker(() => updateSW)
      })
      .catch(() => {
        // PWA runtime unavailable — stay silent; the app works without it.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-gold/50 bg-parchment-card px-4 py-3 text-sm shadow-lg dark:bg-charcoal-card"
    >
      <p>
        <strong>New version ready.</strong> Reload to pick up the latest version of {`The Long Chronicle`} — your data is stored on this device and is not affected.
      </p>
      <button
        type="button"
        onClick={() => void updateServiceWorker?.(true)}
        className="rounded bg-oxblood px-4 py-2 text-sm font-semibold text-white"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="rounded border border-ink/30 px-4 py-2 text-sm"
      >
        Not now
      </button>
    </div>
  )
}
