# The Long Chronicle

An offline-first companion for playing **Thousand Year Old Vampire**: a
personal archive for one vampire's thousand years — memories (kept, lost,
altered), a journal, a character sheet with a full change history, people,
places, story threads, a timeline, and recaps.

Everything lives on the player's own device. There is no account, no server,
no analytics, no AI, and no cloud sync. The app ships **no rulebook
content**: prompts are entered by the player from their own copy of
Thousand Year Old Vampire — no prompt tables, example text, or illustrations
from the game are bundled, and the app never claims rules accuracy.

## Setup

Requires Node 20+ (developed on Node 24).

```sh
npm install
npm run dev      # local development server
npm run build    # tsc + vite build (outputs dist/)
npm run preview  # serve the production build locally
npm run test     # unit tests (Vitest)
npm run typecheck
```

To run the end-to-end tests (Playwright, against `vite preview`):

```sh
npm run build
npx playwright test            # add --project=chromium-desktop to run one project
```

If Playwright browsers are missing, run `npx playwright install chromium`
once. See [Known environment notes](#known-environment-notes) for the
extra steps this particular dev VM needs.

## Use

- **Chronicles** — one chronicle per vampire. Create one, make it active,
  and the Dashboard, Journal, and Memories all work inside it. A second
  chronicle is fully isolated from the first.
- **Memories** — record a memory with its era and tags. Memories can be
  **lost** (the text stays on record, a version is written) or **altered**
  (the old wording is kept in the version history). Nothing is ever deleted
  by losing or altering.
- **Journal** — entries with an era (free text, e.g. "late 14th century"),
  prompt capture, Markdown body, linked memories / people / places / threads,
  and character changes recorded alongside the entry.
- **Character** — skills, resources, conditions/traits, and a complete
  change history, newest first.
- **Timeline** — the centuries in order: saved historical and custom events
  merged with events derived from journal entries, memories, and character
  changes. Approximate eras ("late 14th century") sit in entry order and are
  never forced into an exact date; events can link people and places.
- **People & Places** — everyone the vampire has known and everywhere they
  have been, with detail pages that list the memories and journal entries
  naming each person or place.
- **Search** — `⌘/Ctrl K` anywhere, or the Search button. Searches memories,
  journal entries, people, places, threads, skills, resources, notes, and
  recaps, and jumps straight to the result.
- **Settings & Data** — theme, editor font size, keyboard shortcuts, and
  backup / restore (below).

Keyboard shortcuts: `⌘/Ctrl K` search, `⌘/Ctrl N` new journal entry,
`⌘/Ctrl S` save everything now, `⌘/Ctrl ⇧ M` new memory, `?` shortcut help,
`Esc` close dialog or search.

## New in this round

Seven small additions, all local-only like the rest of the app:

- **Used-prompt log** — a prompt note can be marked as used in play
  (`promptNotes.used`), so a prompt already spent is easy to tell apart
  from one still waiting.
- **Time-jump helper** — jumps the chronicle forward across uneventful
  years and records the jump on the timeline as a time-jump event.
- **Memory review mode** — a pass for re-reading memories one by one; each
  review is stamped with the date (`memories.lastReviewedAt`).
- **Character snapshots** — frozen copies of the character sheet at a
  chosen era: skills, resources, and conditions as they stood then.
  Snapshots are never edited.
- **Book export** — the whole chronicle as one self-contained `.html` file
  (see [Backup & restore](#backup--restore)).
- **Attachments** — files attached to a memory, journal entry, person, or
  place. The bytes live in IndexedDB as a Blob; the cap is 5 MB per file.
- **Quiet writing stats** — counts only: words written, journal entries,
  entries per era, memories kept / lost / altered, people, places, threads,
  and the span of eras covered. No streaks, no goals, no comparisons. Shown
  on the Dashboard and in the Archive (`<WritingStatsPanel />`).

### Schema v2

The database is now at schema version 2 (`APP.schemaVersion`). Opening a
v1 database upgrades it in place: two new tables (`characterSnapshots`,
`attachments`), and the new fields on old records are backfilled —
`memories.lastReviewedAt` to `null`, `promptNotes.used` to `false`. Every
v1 record is preserved; nothing is dropped or rewritten. Covered by
`tests/migration-v2.test.ts`, which builds a v1-shaped database and opens
it under v2.

## Backup & restore

There is no server copy. **Export is the only backup.** The Settings page
reminds you when the last backup is getting old.

- **Download JSON backup** — a complete, versioned backup of the active chronicle
  (`{app, schemaVersion, exportedAt, chronicle, skills, resources,
  stateChanges, memories + versions, journal, drafts, timeline, people,
  relationships, places, threads, recaps, diceRolls, promptNotes, …}`).
  Download it and keep the file somewhere safe. The backup time is recorded
  on the chronicle and in settings.
- **Import a backup** — the file is validated with Zod *before* anything is
  written, and a preview shows the chronicle name and record counts. Import
  creates a **new chronicle** by default (fresh ids, all cross-links
  remapped); nothing already in the app is overwritten unless you explicitly
  choose *replace* and confirm it. An invalid file, a missing
  `schemaVersion`, or a backup from a newer app version is rejected with a
  plain-language error, and the database is untouched.
- **Markdown export** (`.zip` or a single combined `.md`, via the
  `<DataTools />` component — see below) — for reading and printing:
  Chronicle Overview, Character Sheet, Memories, one file per journal entry
  (`Journal/NNN-title.md`), Timeline, People, Places, Story Threads,
  Recaps. Every file carries the record's stable id so a printed page can be
  traced back to its database row.
- **Book export** (single `.html`, also via `<DataTools />`) — the whole
  chronicle as one self-contained file: Overview, Character Sheet, Memories
  (grouped by status: Active, Lost, Altered, Archived), Journal (one
  section per entry, in order), Timeline, People, Places, Story Threads,
  Recaps. Inline CSS only — no scripts, no external fonts, no external
  references of any kind — so it opens straight from disk and prints
  cleanly. Every record carries its stable id, as in the Markdown export.
- **Single-record exports** (JSON, also via `<DataTools />`) — one journal
  entry (with its linked memories / people / places embedded), all memories,
  the character sheet, or the timeline.

`<DataTools />` (`src/components/DataTools.tsx`) is the single data-management
surface, mounted on the Settings page: JSON backup, Markdown export,
single-record exports, the backup reminder / last-export display, and an
import flow that defaults to import-as-new and offers
*replace-with-explicit-confirmation*.

## Deployment

The app is a static site (`dist/`). Any static host works.

```sh
npm run build
# serve dist/ — e.g. GitHub Pages, Netlify, Cloudflare Pages, nginx
```

**GitHub Pages (project site):** build with the subpath as the base so
assets and the service worker resolve under it:

```sh
VITE_BASE=/the-long-chronicle/ npm run build
```

then publish `dist/` (e.g. via the `actions/deploy-pages` workflow or a
`gh-pages` branch). The manifest `scope`/`start_url` follow the same base.

**Custom domain / subpath:** set `VITE_BASE` to the mount path (always with
leading and trailing slashes, e.g. `/chronicle/`), or `/` for a domain root.
The service worker is generated by `vite-plugin-pwa` (`registerType:
'autoUpdate'`); a new version installs in the background and the
`<UpdatePrompt />` banner offers a reload — never a forced one.
`<UpdatePrompt />` is mounted once in `src/components/Layout.tsx`, so the
banner is live.

## Install as a PWA

- **iPhone (Safari):** open the site, tap Share, then **Add to Home
  Screen**. The app opens full-screen, works offline, and keeps its data in
  the browser's IndexedDB.
- **Mac (Safari or Chrome):** open the site and use **Add to Dock**
  (Safari: File → Add to Dock) or Chrome's install prompt. Same offline
  behaviour as on iPhone.
- **Offline:** once installed, the app shell and data are cached on the
  device — a lost connection changes nothing. Clearing site data, removing
  the installed app, or losing the device takes the chronicle with it, which
  is why exports matter.

## Privacy

Local-only by design: no account, no server, no analytics, no advertising,
no AI processing of your chronicle. Your words stay on your device until you
choose to export them as a file — and what you do with that file is yours.

## Icons

Original mark, drawn for this app: a gold hourglass inside an oxblood arch
on a parchment field, with a gold frame. The same geometry backs the SVG
favicon and the PNG icons.

- `public/favicon.svg` — the mark as SVG.
- `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` —
  rendered from the same geometry by `scripts/make-icons.mjs` (Node
  built-ins only: a procedural rasterizer + a hand-rolled PNG encoder).
  Regenerate with `node scripts/make-icons.mjs`.
- Product name, version, and theme tokens live in `src/config/app.ts` — that
  is the single place to change the product identity.

## Accessibility

- Semantic HTML throughout: `<main>`, `<nav aria-label="Main">`, labelled
  form controls, `role="alert"` for errors, `aria-live` regions for save
  and backup status (announced as text, e.g. "Success: …", never by colour
  alone).
- Visible focus indicators (`:focus-visible` gold outline, see
  `src/styles/index.css`); keyboard shortcuts listed in-app (`?`) and in
  Settings; Tab reaches the main navigation.
- Contrast: parchment/ink/oxblood/gold palette, with a dark theme that keeps
  the same relationships; status badges pair text with tone.
- `prefers-reduced-motion` disables animations and transitions globally.
- The search palette is a labelled dialog with a listbox; dialogs trap
  nothing and close with `Esc`.

## Tests

- **Unit** (`npm run test`, Vitest + fake-indexeddb): JSON export/import
  round-trip and id remapping, validation errors, overwrite rules, the
  hand-rolled ZIP writer round-trip, Markdown export files, the book HTML
  export, quiet writing stats, the schema v1 → v2 migration, and global
  search. Test files: `tests/export-import.test.ts`, `tests/zip.test.ts`,
  `tests/markdown-export.test.ts`, `tests/search.test.ts`,
  `tests/book-export.test.ts`, `tests/writing-stats.test.ts`,
  `tests/migration-v2.test.ts` (plus other streams' suites). All test content is invented placeholder text written
  for the tests.
- **End-to-end** (`tests/e2e/`, Playwright, against `vite preview`):
  chronicle creation + persistence, 10 memories, lose/alter flows, journal
  linking (memory + thread, and person + place), approximate-date timeline
  events, resource history, search, chronicle isolation, keyboard
  navigation, `⌘/Ctrl K`, JSON export → wipe → import round-trip with
  record-count comparison, offline use, PWA manifest/icons/service worker,
  and desktop + phone layouts. 16 tests across 3 spec files
  (`chronicle.spec.ts`, `export-import.spec.ts`, `pwa.spec.ts`), none
  skipped. They are collection-verified only in this sandbox
  (`npx playwright test --list`) — Chromium cannot launch here, so they
  must be executed where a browser runs.

## Known environment notes

These apply to this dev VM only, not to the app or its users.

- **`npm install` fails here** with `EPERM` on writes larger than ~4096
  bytes (a sandbox write-size limit). The working `node_modules/` in this
  checkout was assembled by hard-linking the sibling project's tree
  (`cp -rl` from the Four Against Darkness PWA, same stack). On a normal
  machine, plain `npm install` works.
- **Vitest** defaults to the `node` environment (`vitest.config.ts`):
  `jsdom` is not installed, and every test file carries a
  `// @vitest-environment node` pragma.
- **Playwright on this VM** needs two workarounds (both scripted in
  `scripts/`): `node scripts/prewarm-playwright-cache.mjs` (or
  `npm run prewarm:e2e`) to pre-fill Playwright's transform cache — the
  cache writes otherwise hit the same write limit — then start
  `vite preview` yourself and run tests with
  `NODE_OPTIONS='--import ./scripts/chunked-fs.mjs' npx playwright test`.
  Re-run the pre-warm after any edit to a spec or to
  `playwright.config.ts`. Chromium itself currently cannot launch in this
  VM (the browser process is killed with SIGTRAP on startup), so e2e specs
  are collection-verified here (`npx playwright test --list`: 16 tests)
  and must be executed where a browser runs.

## Copyright

The Long Chronicle is a fan-made companion tool. It contains no text,
tables, examples, or illustrations from Thousand Year Old Vampire or any
other rulebook, and it does not reproduce game rules. Players enter prompts
from their own copy of the game. If you fork this project, keep it that way.
