# Tab Cleanup — project rules

## Purpose

Personal MV3 extension. One button, one scan, two results: unused new-tab pages
and duplicate-URL groups, across all windows. It reports; it closes nothing.
It runs against a real, messy profile, so being unable to do damage matters more
than any feature. What the build does for a user: **README.md**.

## Non-negotiable rules

1. **DRY RUN ONLY.** `DRY_RUN` in `src/lib/config.js` is `true` — no UI toggle,
   no stored setting, and `src/lib/execute.js` has no live branch to flip on.
   *Why:* a wrong answer about *what* to close is recoverable; closing it isn't.
   Graduating is a deliberate, reviewed change — checklist in README.md.
2. **`tabs` is the permission ceiling.** `manifest.json` declares
   `"permissions": ["tabs"]` and nothing else. No `storage`, `tabGroups`, host
   permissions, `<all_urls>` or `content_scripts` without an explicit decision.
   *Why:* most people click through the permission prompt, but the ones who read
   it are exactly the ones deciding whether to trust this. Host permissions and
   content scripts turn a tab lister into a page reader — a different product.
3. **Duplicates are never deleted.** The pass is informational: suggests a
   keeper, lists the rest. *Why:* grouping is heuristic, and nothing destructive
   rides on a heuristic. Selection and closing are a later iteration, additive to
   the existing DOM and data shape.
   > **@blur6666 — review (2026-08-06):** keep this as a staging rule, or let
   > duplicates get selection and closing alongside new tabs?
4. **Protections are honoured and always reported.** Skipped tabs appear in
   `protectedTabs` with reasons. *Why:* a silently applied rule can't be
   verified or tuned.

## Architecture constraints

- `src/lib/url.js` and `src/lib/scan.js` never touch the `chrome` global — pure
  functions, so `node --test` imports them with no browser and no mock.
- `src/lib/chrome-tabs.js` is the only file that may call `chrome.tabs` — one
  auditable choke point.
- No service worker, no shared state: the review page re-runs the scan on load
  instead of receiving a snapshot. Nothing to go stale.
- No build step, no runtime dependencies, no framework.

## Lessons learned

- **Without `tabs`, `tab.url` is `undefined`, not `''`.** Unguarded, every tab
  looks like a blank new tab and the plan becomes "close everything".
  `planCleanup()` throws `MissingTabsPermissionError` — never soften that into a
  default or an empty result. Most dangerous path in the codebase.
- **`chrome.permissions.request()` throws for non-optional permissions.** `tabs`
  is required, so `src/lib/permissions.js` calls `contains()` instead. If `tabs`
  ever moves back to `optional_permissions`, `request()` must be the first
  statement in the click handler with no `await` before it — an intervening
  await consumes the user gesture and the call fails.
- **The dry-run guard bans specific patterns, not `.remove(`.**
  `test/guards.test.js` matches `tabs.remove`, `tabs[...]`,
  `chrome['tabs'].remove`, and destructured `remove`. Do not re-add a blanket
  `.remove(` ban — it forbade `element.remove()` across the whole UI and still
  missed `chrome.tabs['remove']()`. `execute.js` is the real guarantee; the
  regex is a backstop.
- **Chromium exposes no per-tab navigation history.** "Never used" is a URL
  heuristic — a tab navigated *back* to a new-tab page is indistinguishable from
  a fresh one. `lastAccessed` is context, never a filter.

## Browser quirks

- **Brave hands the extensions API `chrome://newtab/`**, not the
  `brave://newtab/` its address bar shows. Edge reports `edge://newtab/`.
  `NEW_TAB_URLS` must carry the `chrome://` form or Brave never matches.
- **`--load-extension` is disabled only on Chrome-branded builds (137+).** It
  works on Brave, Edge, and Playwright's bundled Chromium, headless included, so
  browser testing is partly automatable — recipe in TESTING.md. Automation still
  can't click native (non-DOM) dialogs or judge whether a flagged tab was junk.

## Never

- **No `--remote-debugging-port`.** Unauthenticated; any local process can drive
  it. Playwright talks over a pipe instead.
- **Never `taskkill` a browser process.** It kills the user's real windows and
  real tabs. Close the Playwright context through its API.
- **Never point an automated run at the real profile.** Always a throw-away
  `--user-data-dir`.
