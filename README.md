# Tab Vacuum

A Chromium extension that finds junk tabs across all your windows: new-tab pages you never used, browser-internal pages like Settings and Downloads, and groups of tabs pointing at the same page.

**Scan my tabs** reports candidates without closing anything. **Vacuum 'em all!** immediately closes unused new tabs, system tabs, and duplicate non-keepers in one click, then lists the tabs it closed or skipped. On the review page, you can tick individual tabs, use a section's **select all** plus **Close selected**, or press **Kill 'Em All** to take every duplicate except one copy per group plus the unused new tabs; review-page close actions still require a second click.

## Install (unpacked)

Built for **Brave** (Chromium 127 or later). Open `brave://extensions` → **Developer mode** → **Load unpacked** → this repository's root folder.

It asks for one permission, `tabs`, which your browser calls *"Read your browsing history"*. To see what it actually got: **Details** on the card → **Permissions**. Expect that one entry and no host permissions. Loading unpacked never shows an install dialog, so the Details page is the only real check.

One further permission, `tabGroups`, is *optional* and never requested unless you press **Show group names**. Everything works without it.

That warning is broader than what the extension does, and the naming is genuinely misleading — [why it is unavoidable](#permissions-why-read-your-browsing-history) is worth reading before you install.

## Packaging for the Chrome Web Store

`npm run package` writes `tab-vacuum-<version>.zip` at the repo root, containing only `manifest.json`, the icons, and `src/` — no `test/`, no `.md` files, no `package.json`, no `tmp/`, no dotfiles. It stages those files in `tmp/package` (deleted afterward) and zips them with a small, dependency-free ZIP writer in `scripts/package.js` — stored entries, not deflated, which keeps it a few dozen lines instead of vendoring a compression library — so it runs the same on Windows, Linux and macOS, including CI. `*.zip` is gitignored, so the output never gets committed.

## Using the extension

Open the extension from the toolbar. **Scan my tabs** reads every tab in every normal browser window using the same profile as you and produces the results below. Cleanup runs in a short-lived background worker only when you click **Vacuum 'em all!**, so closing the active tab cannot interrupt it.

Once results are showing, that same button reads **Scan again** — pressing it re-runs the scan in place. **Review & clean →** is the one that moves you to the report.

**Scan my tabs** reports in the popup. **Vacuum 'em all!** closes its candidates immediately and shows only the tabs it closed or skipped. **Review & clean →** opens a full page listing everything the scan found for detailed, one-by-one cleanup.

Every row on the review page shows which tab group it belongs to — `g1`, `g2`, … numbered stably across the whole report, or `—` for an ungrouped tab. Grant the optional `tabGroups` permission and the column reads `g1 · Work` in the group's own colour instead. The browser's own group id is in the tooltip, which is what the copied report lists.

**Only tabs up for deletion**, the checkbox in the page header, is ticked when the page loads and limits the page to what you can act on. Untick it to add an **Other tabs** section listing every remaining tab in the profile with the reason it is not on offer — `only copy` for a page open exactly once, `not scanned for duplicates` for anything outside `http`/`https` that isn't a recognised system page either (a `file://` URL, for instance). Those rows are context only: greyed, checkbox disabled, and unreachable by **Kill 'Em All** or any other bulk action. Toggling the filter re-renders what is already on screen; it does not rescan and does not disturb your selection.

Excluded from the scan entirely:

- **Incognito tabs** — skipped, and the count of skipped tabs is reported.
- **Non-normal windows** — devtools, app and popup windows are not tabs a user cleans up.

### Result 1 — unused new tabs

A tab qualifies when its URL is a new-tab page: `chrome://newtab/`, `edge://newtab/`, `about:blank`, one of the other Chromium-family variants, or nothing committed yet.

Both the current URL **and** the pending URL must be new-tab pages. A tab part-way through navigating to real content is never a candidate.

A qualifying tab is **excluded and shown separately with its reason** when any of these hold:

| Protection | Reason shown |
| --- | --- |
| Pinned | `pinned` |
| Playing audio | `audible` |
| In a tab group | `grouped` |
| The only tab in its window | `only tab in window` |
| The extension's own review page | `extension page` |

**Being the active tab is not a protection.** A blank new-tab page sitting at the front of a window is usually exactly the tab you meant to be rid of, and closing it just reveals the tab behind it. The case that genuinely mattered — the active tab being the *only* tab, so closing it closes the window — is still covered by `only tab in window`. `PROTECT.active` in `src/lib/config.js` turns it back on.

Protected tabs are always listed rather than silently dropped — greyed, marked ⚠ with the reason, and with the checkbox disabled so no bulk action can reach them. The rules stay visible and can be tuned in `src/lib/config.js`.

**Known limitation.** Chromium exposes no per-tab navigation history, so "never used" is not directly observable. **A tab you used and then navigated back to a new-tab page is indistinguishable from a fresh one.** The URL is the strongest signal available without additional permissions, which is why this result is a suggestion rather than a verdict. `lastAccessed` is displayed as context and is never used as a filter.

### Result 2 — system tabs

Browser-internal pages that are not the new-tab page but are not real content either — Settings, Downloads, History, Extensions, Bookmarks, and whatever else ships under the browser's own scheme. Matched by URL scheme (`SYSTEM_URL_SCHEMES` in `src/lib/config.js`: `chrome:`, `edge:`, `brave:`, `vivaldi:`, `opera:`), not by path, so a future built-in page needs no update to be caught.

`chrome-extension:` is deliberately excluded — that scheme covers every installed extension's own pages, not the browser's built-in ones, and lumping them in would turn an ordinary extension's options page into a "system" tab.

Protected by the same rules and for the same reasons as unused new tabs — pinned, audible, grouped, or the only tab in its window — since a system tab is a single-instance offer, not a duplicate-group member.

Kept out of **Kill 'Em All** on purpose: Settings or Downloads sitting open is a far more ordinary, intentional thing than a stray blank new-tab page, so this section gets its own **select all** button feeding the same **Close selected** confirm, rather than riding along with the one-click danger button.

### Result 3 — duplicate tabs

Only `http` and `https` tabs participate. They are grouped by a normalised URL:

- anchors (`#…`) dropped
- tracking parameters stripped — `utm_*`, `fbclid`, `gclid`, `ref`, `ref_src`, `mc_cid`, `mc_eid`, `igshid`
- remaining query parameters sorted
- trailing slash and default port dropped, host lower-cased

Deliberately conservative: `http` ≠ `https`, `www.example.com` ≠ `example.com`, and paths stay case-sensitive. Each is a single flag in `src/lib/config.js`.

**Tab groups are deduplicated separately.** The same URL open in a group called "Work" and again in "Research" produces *two* groups, each keeping its own copy. Opening the same reference page in two projects is usually deliberate, so the extension treats group membership as part of a tab's identity. Turn it off with `DEDUPE_WITHIN_TAB_GROUPS` in `src/lib/config.js` for one keeper across the whole profile.

Only groups of two or more are reported, largest group first. Each group suggests one tab to keep (marked ★), chosen in this order:

1. pinned
2. active
3. most recently used
4. first in window order

Ties break deterministically by tab index, then window id, then tab id — the same input always produces the same suggestion.

The ★ is a suggestion, not a lock: nothing is pre-ticked, and you can tick the ★ and keep a different copy instead. **Kill 'Em All never selects a ★**, so it cannot empty a group no matter how the protections fall.

A duplicate is protected — ⚠, greyed, checkbox disabled — when it is **pinned** or **audible**. That list is `NEVER_CLOSE` in `src/lib/config.js`, and it is deliberately shorter than the new-tab one:

- **`grouped` is not on it.** Protecting grouped tabs would make per-group deduplication pointless — the second copy inside a group is exactly what you want closed.
- **`only tab in window` is not on it either.** Closing a duplicate that is alone in its window closes that window. The row warns you (`⚠ closes its window`) rather than forbidding it.

## What it does not do

- **No persistence.** No `storage` permission or saved history. A service worker holds the latest Vacuum result in memory until it stops, so the popup can recover its feedback when cleanup removes the active tab. The review page re-runs the scan on load rather than receiving a snapshot.
- **No network access.** Nothing is sent anywhere — no usage data, no telemetry.
- **No page access.** No host permissions and no content scripts, so it cannot read or change the contents of any page.

The one path by which data leaves is **⧉ Copy report**, which places a markdown report of the scan on your clipboard — including the **Other tabs** section, whatever the filter is set to on screen. You trigger it; it goes nowhere else.

## Permissions: why "Read your browsing history"

`chrome.tabs.query()`, `create()`, `getCurrent()` — and even `remove()` — require **no permission at all**. You can close tabs without asking for anything. The `tabs` permission does exactly one thing: it un-redacts four fields on the `Tab` objects those calls return — `url`, `pendingUrl`, `title` and `favIconUrl`.

Reading URLs is the entire feature. Without it the scan cannot tell a new tab from a duplicate from anything else.

Chromium prompts for any permission carrying a warning string, and `tabs` carries the same one as `history`. The reasoning is sound: anything holding `tabs` *can* read the url and title of every tab in every window continuously, including on every navigation via `tabs.onUpdated`. That is a live feed of browsing activity, whether or not an extension uses it that way. This one reads URLs at the moment you click, keeps nothing, and has no way to transmit anything.

**Alternatives, and why none of them work here:**

| Option | Why not |
| --- | --- |
| `activeTab` | No warning at all, but covers only the current tab after a click. Finding duplicates *across windows* needs every tab. |
| Narrow host permissions | Reveal urls only on listed sites — useless for a general scan, and `chrome://newtab/` accepts no host permission at all. |
| `<all_urls>` | Reveals urls, but also grants reading and changing page content. Strictly worse. |
| Drop it entirely | Leaves `url` and `title` empty. The scan cannot identify a new tab or a duplicate. |

So `tabs` is the genuine minimum for these two features, and every comparable extension (OneTab, Tab Wrangler) asks for at least the same.

Closing tabs, incidentally, needs no permission either — `chrome.tabs.remove()` is unrestricted. Nothing about the close path widens what this extension can see.

### The optional one: `tabGroups`

Declared in `optional_permissions`, so it is not granted at install and is only requested if you press **Show group names**. Its warning is *"View and manage your tab groups"*.

It buys labels and nothing else: group headings read **Work** in the group's own colour instead of **group 1**. Per-group deduplication reads `tab.groupId`, which is present on every tab with no permission at all — so declining changes which words you see, never which tabs are found or closed.

It was *optional* until 2026-08-06, requested on first click. That was dropped because the identical warning fired either way — the same disclosure, delivered as a mid-session dialog instead of at install.

If you revoke `tabs` from the extension's Details page, the scan refuses to run and says so — it does not fall back to an empty or wrong plan.

## What gets closed, and what never does

There is no dry-run flag. The safety is at runtime, in three layers:

1. **Protections.** A protected tab has a disabled checkbox and is excluded from every bulk action — select-all and Kill 'Em All walk only closable rows, so they cannot reach it.
2. **Review-page confirmation.** **Close selected** and **Kill 'Em All** arm on the first click — `Close 14? — click again` — and revert after three seconds. Kill 'Em All also ticks everything it is about to take, so the selection is visible before you confirm it. **Vacuum 'em all!** is the deliberate one-click exception: it closes the ordinary scan's candidates immediately and then lists the tabs it closed or skipped without the scan breakdown. Review-page confirmation is not a native `confirm()` dialog, which would block every extension event until dismissed.
3. **Re-validation at the moment of closing.** `closeTabs()` in `src/lib/execute.js` re-reads every tab first and skips any that changed since the scan — navigated somewhere else, became pinned, started playing audio, or was already closed. Each skip is reported back with its reason.

Layer 3 is the one that actually holds. A review page can sit open for an hour while tabs change underneath it.

`test/guards.test.js` backs this structurally: exactly one file (`src/lib/chrome-tabs.js`) may call the browser's close API, and the manifest may not grow beyond `tabs` plus optional `tabGroups`. Those are regexes and cannot be airtight — see CLAUDE.md for what they do and do not catch.

**Undo is the browser's.** `Ctrl+Shift+T` reopens closed tabs one at a time, and the page tells you so after every close. The extension keeps no history of its own — that would need the `sessions` permission.

### Worth checking yourself

Two things automation cannot judge:

- **A false-positive audit.** Scan, read the report, and confirm every tab offered under "would close" is genuinely junk *before* you trust Kill 'Em All on a real window. Use **⧉ Copy report**.
- **The revoked-permission path.** Turn `tabs` off on the Details page and confirm the scan refuses and explains, rather than producing an empty or bogus plan. This is the most dangerous path in the codebase: without the permission every `url` is `undefined`, which unguarded would make every tab look like a blank new tab.

## Development

`npm test` — `node --test`, no dependencies. 62 tests: URL heuristics, every protection rule, keeper selection, per-group deduplication, the permission interlock, the guarantee that context-only rows stay unreachable, and the close path with injected fakes so no browser is needed.

Every push and every pull request runs that suite on GitHub Actions (`.github/workflows/test.yml`), on Node 20.12 and 22 — 20.12 being the floor, since `test/guards.test.js` needs `Dirent.parentPath` and `import.meta.dirname`. There is no install step and no cache, because there is nothing to install. Until that workflow existed the guard tests were a guarantee only when somebody remembered to run them.

Browser testing is **partly** automatable: Brave and Edge still honour `--load-extension`, so Playwright can load the extension and drive its pages (CLAUDE.md explains why Chrome-branded builds cannot). Install Playwright **outside this repo** so the project stays dependency-free:

```js
import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(THROWAWAY_PROFILE_DIR, {
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
  viewport: null,
  args: [`--disable-extensions-except=${REPO_ROOT}`, `--load-extension=${REPO_ROOT}`],
});
```

Two gotchas that cost real time:

- **Find the extension id by name.** Read `chrome://extensions-internals/` and match on `name === 'Tab Vacuum'`. Do not take the first id in that dump — Edge ships built-in extensions that appear first, and you end up navigating to a page that does not exist.
- **Pass `viewport: null`.** Otherwise Playwright pins a 1280×720 viewport and silently ignores `--window-size`.

Two rules for any scripted run: a throw-away `--user-data-dir`, never your real profile, and never `taskkill` a browser process — close the context through Playwright's API.

If Vacuum removes the active browser tab, Chromium dismisses the toolbar popup; the worker automatically reopens it with the completed results. The popup otherwise closes when it loses focus, which makes its console hard to reach; right-click the popup → **Inspect** pins it open. **⧉ Copy report** puts the whole scan on the clipboard as markdown — that is the artifact to bring back for tuning. It lists your real URLs and titles, so it is yours to read, not something to paste anywhere.

Decision logic lives in `src/lib/url.js` and `src/lib/scan.js` as pure functions over plain `Tab`-shaped objects, which is why `node --test` can import them without a browser. Tunables — heuristics, thresholds, protections, normalisation flags — are in `src/lib/config.js`. Architecture rules are in CLAUDE.md.
