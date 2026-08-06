# Tab Cleanup — project rules

A Chrome/Chromium MV3 extension that finds junk tabs across all windows.
One button, "Clean up my tabs", runs a single scan that produces two results:
unused new-tab pages, and duplicate-URL groups.

## Non-negotiable rules

1. **DRY RUN ONLY.** This project is in a development phase where it must be
   impossible to close a tab. `chrome.tabs.remove` must not appear anywhere in
   `src/`. `DRY_RUN` in `src/lib/config.js` is `true` and there is no UI toggle,
   no storage-backed setting, and no live code path. `test/guards.test.js`
   enforces this and must never be weakened. Graduating to live closing is a
   deliberate, reviewed change — see the checklist in README.md.
2. **Least privilege — `tabs` is the ceiling.** `manifest.json` declares
   `"permissions": ["tabs"]` and nothing else. `tabs.query`, `tabs.remove`,
   `tabs.create` and `tabs.getCurrent` need no permission at all; `tabs` is
   required *only* to read `url` / `pendingUrl` / `title` / `favIconUrl`, and
   reading urls is exactly what both features do. Do not add `storage`,
   `tabGroups`, host permissions, `<all_urls>` or `content_scripts` without an
   explicit decision — host permissions and content scripts are what turn a tab
   lister into a page reader, which is a different product.

   `tabs` was optional until 2026-08-06 and is now required. It carries the
   "Read your browsing history" warning either way: the Chromium prompt fires
   for any permission that has a warning string attached, and `tabs` has one
   because it exposes every tab's url continuously. Making it optional moved
   that same warning from install time to a mid-session dialog without removing
   it — strictly worse for the identical disclosure. Decided by the user after
   confirming every comparable extension (OneTab, Tab Wrangler) asks for at
   least this. `activeTab` and narrow host permissions were considered and do
   not work: the scan needs every tab in every window, and `chrome://newtab/`
   accepts no host permission at all.
3. **Duplicates are never deleted.** The duplicate pass is informational. It
   suggests a keeper and lists the rest. Selection and closing are a later
   iteration, and are additive to the existing DOM/data shape.
4. **Protections are honoured and always reported.** A new-tab page is never a
   close candidate if it is pinned, active, audible, in a tab group, or the only
   tab in its window. Skipped tabs appear in `protectedTabs` with reasons — the
   rules must stay visible and tunable.

## Architecture

- Plain ESM. **No build step, no runtime dependencies, no framework.**
- All decision logic is pure functions over plain `Tab`-shaped objects in
  `src/lib/url.js` and `src/lib/scan.js` — they must never touch the `chrome`
  global, because `node --test` imports them directly.
- `src/lib/chrome-tabs.js` is the only file allowed to call `chrome.tabs`.
- No service worker and no shared state: the review page re-runs the scan on
  load rather than receiving a snapshot.

### What the dry-run guard actually checks

`test/guards.test.js` bans the patterns that reach `chrome.tabs.remove` —
`tabs.remove`, `tabs[...]`, `chrome['tabs'].remove`, and destructuring `remove`
off `tabs`. Ordinary DOM calls are fine.

It used to ban `.remove(` outright. That was dropped on 2026-08-06: it forbade
`element.remove()` and `classList.remove()` across the whole UI while still
missing `chrome.tabs['remove']()`, so it distorted the code and bought no real
safety. The existing `replaceChildren()` / `classList.toggle(name, on)` usage is
fine and was left alone — it is good modern DOM — but it is no longer required.

No regex guard is airtight, and this one does not claim to be. The load-bearing
guarantee is `src/lib/execute.js`, which has no live close branch to reach.

## Commands

- `npm test` — `node --test`, no dependencies.
- Load unpacked: `edge://extensions` or `brave://extensions` → Developer mode →
  Load unpacked → repo root. Loading unpacked shows no install dialog at all, so
  check the granted permissions on the extension's **Details** page under
  *Permissions*, not by the presence or absence of a prompt. Expect exactly one:
  the `tabs` permission, shown as "Read your browsing history".

## Target browsers

**Brave first, Edge second. The user does not use Chrome** and does not plan to
— write install and testing instructions for `brave://` and `edge://`, not
`chrome://`.

That is about the *UI*, not the API. `chrome://` URLs very much do show up in
practice: Brave itself reports `chrome://newtab/` to `chrome.tabs` (see below).
The code stays fork-agnostic — the `chrome.*` namespace and `chrome://` internal
URLs are what every Chromium browser implements, whatever the branding.

### New-tab URLs — now observed, and one surprise

Settled on 2026-08-06 by calling `chrome.tabs.create({})` from inside the
extension and reading back what `chrome.tabs` reports:

| Browser | Reports | Note |
| --- | --- | --- |
| Edge | `edge://newtab/` | as documented |
| Brave 1.93.132 | `chrome://newtab/` | **not** `brave://newtab/` |

Brave shows `brave://` in the address bar but hands the extensions API
Chromium's internal `chrome://newtab/`. The entry carrying Brave is therefore
`chrome://newtab`, not `brave://newtab`. Both browsers return `true` from
`isNewTabUrl()`, so this was never a bug — only the documented reason was wrong.

If a scan ever reports zero unused new tabs, this is still the first thing to
re-check, since a fork can change it in an update.

## Browser testing: what can and cannot be automated

This section used to say browser testing was impossible to automate. That was
wrong, and was corrected on 2026-08-06 after testing it.

The `--load-extension` switch was disabled in **Chrome-branded** builds at
version 137 (malware abused it). It was *not* removed from Chromium itself. So:

| | `--load-extension` |
| --- | --- |
| Google Chrome 150 | ignored, extension never registers |
| Brave 1.93.132 | **works** (`location: COMMAND_LINE`) |
| Edge (Chromium 151) | **works** |
| Playwright's bundled Chromium | **works**, headless included |

Playwright drives Brave and Edge directly via `executablePath`. Verified
end-to-end: extension loads, `review.html` renders, and the scan groups real
duplicate tabs correctly. See TESTING.md for the exact recipe.

Two caveats that keep parts of the plan manual:

- **Native dialogs are out of reach.** Anything Chromium renders outside the
  DOM — the optional-permission prompt in particular — cannot be clicked by
  Playwright. This mattered less once `tabs` became required.
- **Playwright's own Chromium is not Brave.** It proves the code runs; it does
  not prove Brave behaves. Point `executablePath` at the real browser for
  anything fork-sensitive, such as new-tab URLs.

Two further rules, both from an explicit user request. These are the two
restrictions here with a concrete reason behind them — keep them:

- **Do not launch browsers with `--remote-debugging-port`.** A debug port is
  unauthenticated and any local process can drive it. Playwright does not need
  one; it talks over a pipe, so nothing is lost by respecting this.
- **Never `taskkill /IM brave.exe`** (or msedge/chrome) — it kills the user's
  real browser and their real tabs, not just an automated instance. Close a
  Playwright context through its API instead.

Automated runs must use a throw-away `--user-data-dir`, never the real profile.

The test plan lives in **TESTING.md**. `npm test` covers all pure logic; the
Playwright recipe covers loading and rendering; what genuinely needs the user is
judging false positives against their own real tabs.

## Known limitation

Chromium exposes no per-tab navigation history, so "never used" is not directly
observable. A tab navigated *back* to a new tab page is indistinguishable from a
fresh one. The URL heuristic is the strongest signal available without extra
permissions; `lastAccessed` is shown as context, never used as a filter.
