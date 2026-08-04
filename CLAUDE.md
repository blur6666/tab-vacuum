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
2. **Least privilege.** `manifest.json` declares `"permissions": []`. `tabs` is
   an *optional* permission requested inside a click gesture. Do not add
   permissions (`storage`, `tabGroups`, host permissions, `<all_urls>`) without
   an explicit decision — each one adds an install-time warning. `tabs.query`,
   `tabs.remove`, `tabs.create` and `tabs.getCurrent` need no permission; `tabs`
   is required only to read `url` / `pendingUrl` / `title` / `favIconUrl`.
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

### Consequence of rule 1 you will trip over

`test/guards.test.js` fails on any `.remove(` in `src/`, not just `tabs.remove`.
So the DOM code uses `element.replaceChildren()` and `classList.toggle(name, on)`
instead of `element.remove()` and `classList.remove()`. Keep it that way.

## Commands

- `npm test` — `node --test`, no dependencies.
- Load unpacked: `edge://extensions` or `brave://extensions` → Developer mode →
  Load unpacked → repo root. The extension must require **no permissions at
  install time**. Loading unpacked shows no install dialog at all, so verify
  this on the extension's **Details** page under *Permissions*, not by the
  absence of a prompt.

## Target browsers

**Edge and Brave. The user does not use Chrome** — do not write Chrome-specific
instructions or assume `chrome://` URLs will ever be seen in practice. The code
stays fork-agnostic (the `chrome.*` namespace is what every Chromium browser
implements, regardless of branding).

### Unverified assumption

`NEW_TAB_URLS` in `src/lib/config.js` lists `edge://newtab/` and
`brave://newtab/` from documentation, **not observation**. Neither has been
confirmed against a real browser, and forks sometimes keep Chromium's internal
`chrome://newtab/`. If a scan reports zero unused new tabs, check this first —
see TESTING.md step 1.

## Browser testing is manual and cannot be automated

Do not attempt to script a browser to test this extension. Chromium removed the
`--load-extension` switch in version 137 (malware abused it). Verified against
Chrome 150 on Windows: the switch is silently ignored headful *and* headless,
and the extension never registers in the profile. There is no scripted install
path for an unpacked extension.

Two further rules, from an explicit user request:

- **Do not launch browsers with `--remote-debugging-port`.** A debug port is
  unauthenticated and any local process can drive it.
- **Never `taskkill /IM chrome.exe`** (or msedge/brave) — it kills the user's
  real browser and their real tabs, not just an automated instance.

The test plan lives in **TESTING.md**. Hand it to the user; do not try to
execute it. `npm test` is the automated half and covers all pure logic.

## Known limitation

Chromium exposes no per-tab navigation history, so "never used" is not directly
observable. A tab navigated *back* to a new tab page is indistinguishable from a
fresh one. The URL heuristic is the strongest signal available without extra
permissions; `lastAccessed` is shown as context, never used as a filter.
