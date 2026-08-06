# Tab Cleanup — project rules

## Purpose

Personal MV3 extension. When you press "Clean tabs" it scans all tabs of all windows of the profile you're using in the browser and lists the results in two groups:
unused new-tab pages and and duplicate-URL groups, across` all windows. It reports; and lets you analyze one by one or you can click the button Kill 'Em All. To remove all of the duplicates and unused tabs. 

## Rules

1. First start in **DRY RUN MODE.** `DRY_RUN` in `src/lib/config.js` is `true` — no UI toggle, no stored setting, and `src/lib/execute.js` has no live branch to flip on. We currently do not check about the "back stack", which is the history of the tab when pressing the back button, and there might be something important there. 

3. **Duplicates are not automatically deleted.**. Why? Because there might be multiple copies of the same page in different groups and it MIGHT make sense to leave them wher they are 
???? 4. **Protections are honoured and always reported.** Skipped tabs appear in `protectedTabs` with reasons. *Why:* a silently applied rule can't be verified or tuned.

## Architecture constraints

- `src/lib/url.js` and `src/lib/scan.js` never touch the `chrome` global — pure functions, so `node --test` imports them with no browser and no mock.
- `src/lib/chrome-tabs.js` is the only file that may call `chrome.tabs` — one auditable choke point.
- No service worker, no shared state: the review page re-runs the scan on load instead of receiving a snapshot. Nothing to go stale.
- No build step, no runtime dependencies, no framework.

## Lessons learned

- **`tabs` is the permission ceiling.** `manifest.json` declares `"permissions": ["tabs"]` and nothing else. No `storage`, `tabGroups`, host permissions, `<all_urls>` or `content_scripts` without an explicit decision.
- **Without `tabs`, `tab.url` is `undefined`, not `''`.** Unguarded, every tab looks like a blank new tab and the plan becomes "close everything". `planCleanup()` throws `MissingTabsPermissionError` — never soften that into a default or an empty result. Most dangerous path in the codebase.
- **`chrome.permissions.request()` throws for non-optional permissions.** `tabs` is required, so `src/lib/permissions.js` calls `contains()` instead. If `tabs` ever moves back to `optional_permissions`, `request()` must be the first statement in the click handler with no `await` before it — an intervening await consumes the user gesture and the call fails.
- **The dry-run guard bans specific patterns, not `.remove(`.** `test/guards.test.js` matches `tabs.remove`, `tabs[...]`, `chrome['tabs'].remove`, and destructured `remove`. Do not re-add a blanket `.remove(` ban — it forbade `element.remove()` across the whole UI and still missed `chrome.tabs['remove']()`. `execute.js` is the real guarantee; the regex is a backstop.
- **Chromium exposes no per-tab navigation history.** "Never used" is a URL heuristic — a tab navigated *back* to a new-tab page is indistinguishable from a fresh one. `lastAccessed` is context, never a filter.

## Browser quirks

- **Brave hands the extensions API `chrome://newtab/`**, not the `brave://newtab/` its address bar shows. Edge reports `edge://newtab/`. `NEW_TAB_URLS` must carry the `chrome://` form or Brave never matches.
- **`--load-extension` is disabled only on Chrome-branded builds (137+).** It works on Brave, Edge, and Playwright's bundled Chromium, headless included, so browser testing is partly automatable — recipe in TESTING.md. Automation still can't click native (non-DOM) dialogs or judge whether a flagged tab was junk.

## Not God's mandaments but be careful:

- **No `--remote-debugging-port`.** Unauthenticated; any local process can drive it. Playwright talks over a pipe instead.
- **Never `taskkill` a browser process.** It kills the user's real windows and real tabs. Close the Playwright context through its API.
- **Never point an automated run at the real profile.** Always a throw-away `--user-data-dir`.
