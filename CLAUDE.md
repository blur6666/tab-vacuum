# Tab Cleanup — project rules

MV3 extension. One button, one scan, two results: unused new-tab pages and
duplicate-URL groups. What the build actually does for a user: **FEATURES.md**.

## Non-negotiable rules

1. **DRY RUN ONLY.** It must be impossible to close a tab. `DRY_RUN` in
   `src/lib/config.js` is `true`, with no UI toggle, no stored setting and no
   live code path. `src/lib/execute.js` has no live branch to reach — flipping
   the flag deletes nothing. Graduating is a deliberate, reviewed change; the
   checklist is in README.md.
2. **`tabs` is the permission ceiling.** `manifest.json` declares
   `"permissions": ["tabs"]` and nothing else. Do not add `storage`,
   `tabGroups`, host permissions, `<all_urls>` or `content_scripts` without an
   explicit decision — host permissions and content scripts are what turn a tab
   lister into a page reader, which is a different product.
3. **Duplicates are never deleted.** The duplicate pass is informational: it
   suggests a keeper and lists the rest. Selection and closing are a later
   iteration, additive to the existing DOM and data shape.

   > **@blur6666 — review.** On 2026-08-06 you said the duplicate feature could
   > take a larger scope if it turns out to be the high-value one. This rule
   > currently forbids that. Keep it as a staging rule, or drop it and let
   > duplicates get selection and closing alongside new tabs?
4. **Protections are honoured and always reported.** Skipped tabs appear in
   `protectedTabs` with their reasons — the rules must stay visible and tunable,
   never silently applied.

## Architecture constraints

- `src/lib/url.js` and `src/lib/scan.js` are pure and **must never touch the
  `chrome` global** — `node --test` imports them directly, with no browser and
  no mock.
- `src/lib/chrome-tabs.js` is the only file allowed to call `chrome.tabs`.
- No service worker and no shared state: the review page re-runs the scan on
  load rather than receiving a snapshot from the popup.
- No build step, no runtime dependencies, no framework.

## What cost time to learn

Everything in this section was established by observation, contradicts something
plausible, or would silently waste an afternoon if rediscovered from scratch.

### Brave reports `chrome://newtab/`, not `brave://newtab/`

Confirmed 2026-08-06 by calling `chrome.tabs.create({})` inside the extension and
reading back what `chrome.tabs` reports. Edge reports `edge://newtab/` as
documented; Brave 1.93.132 shows `brave://` in the address bar but hands the
extensions API Chromium's internal URL. So the `NEW_TAB_URLS` entry carrying
Brave is `chrome://newtab`, and `brave://newtab` never fires.

Consequence for docs: write install instructions for `brave://` and `edge://`
(the user does not use Chrome), but do **not** assume `chrome://` URLs are
absent from the API — one of them is load-bearing.

### `--load-extension` works everywhere except Chrome-branded builds

The switch was disabled in **Chrome-branded** builds at version 137, not removed
from Chromium. Verified 2026-08-06:

| | `--load-extension` |
| --- | --- |
| Google Chrome 150 | ignored, extension never registers |
| Brave 1.93.132 | works (`location: COMMAND_LINE`) |
| Edge on Chromium 151 | works |
| Playwright's bundled Chromium | works, headless included |

So browser testing is **partly automatable** — an earlier version of this file
claimed it was impossible, based on testing Chrome alone. Playwright drives the
real Brave via `executablePath`; recipe in TESTING.md.

Two things automation still cannot do: click anything Chromium draws outside the
DOM (native dialogs), and judge whether a flagged tab was really junk.

### `chrome.permissions.request()` throws unless the permission is optional

It only accepts permissions declared in `optional_permissions`. Since `tabs` is
now required, `src/lib/permissions.js` calls `contains()` instead. If `tabs` is
ever moved back to optional, `request()` must be the **first statement** of the
click handler with no `await` before it — an intervening await consumes the user
gesture and the call fails.

### The dry-run guard is deliberately narrow

`test/guards.test.js` bans the patterns that reach `chrome.tabs.remove`:
`tabs.remove`, `tabs[...]`, `chrome['tabs'].remove`, and destructuring `remove`
off `tabs`. Ordinary DOM calls are fine.

It previously banned `.remove(` outright. Do not re-add that: it forbade
`element.remove()` and `classList.remove()` across the whole UI while still
missing `chrome.tabs['remove']()` — cost readability, bought no safety. No regex
guard is airtight and this one does not claim to be; `execute.js` is the
load-bearing guarantee.

### The permission interlock is the most dangerous code path

Without `tabs`, `tab.url` is `undefined` rather than `''`. Left unguarded, every
tab in the browser looks like a blank new tab and the plan becomes "close
everything". `planCleanup()` throws `MissingTabsPermissionError` instead. Never
soften that into a default or an empty result.

### No per-tab navigation history exists

Chromium exposes none, so "never used" is not directly observable: a tab
navigated *back* to a new-tab page is indistinguishable from a fresh one. The URL
is the strongest signal available without more permissions. `lastAccessed` is
context only, never a filter.

## Never

- **Do not launch browsers with `--remote-debugging-port`.** The port is
  unauthenticated and any local process can drive it. Playwright talks over a
  pipe and does not need one.
- **Never `taskkill` a browser process.** It kills the user's real browser and
  real tabs. Close a Playwright context through its API.
- **Never point an automated run at the real profile.** Always a throw-away
  `--user-data-dir`.
