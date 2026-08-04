# Tab Cleanup

A Chrome/Chromium extension that finds junk tabs across all your windows. One
button, **Clean up my tabs**, runs a single scan that produces two results:

- **Unused new tabs** — new-tab pages that were opened and never navigated.
- **Duplicate tabs** — groups of tabs pointing at the same page.

> **This build cannot close a tab.** It is in a dry-run development phase: it
> reports what it *would* close and closes nothing. See
> [Dry run](#dry-run-and-how-to-graduate) below.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this repository's root folder

**Installing shows no permission warning.** That is deliberate — see below.

## Permissions: why there are none at install time

`manifest.json` declares `"permissions": []`. The `tabs` permission is
*optional* and is requested the first time you click the button:

```json
"permissions": [],
"optional_permissions": ["tabs"]
```

This works because of a detail in the Chrome API: `chrome.tabs.query()`,
`chrome.tabs.create()` and `chrome.tabs.getCurrent()` require **no permission at
all**. The `tabs` permission exists only to un-redact four sensitive fields on
the `Tab` objects they return — `url`, `pendingUrl`, `title` and `favIconUrl`.
Reading URLs is exactly what this extension needs, and nothing more. Host
permissions would also reveal URLs, but they grant far more (the ability to read
and change page content), so `tabs` is the genuine minimum.

Two consequences worth knowing:

- On some Chrome builds the permission prompt closes the popup. Re-open it — the
  permission is already granted and the scan runs immediately.
- Without the permission, `tab.url` is `undefined` rather than `''`. Left
  unguarded, every tab in the browser would look like a blank new tab, so
  `planCleanup()` throws `MissingTabsPermissionError` rather than producing a
  catastrophically wrong plan.

## What counts as an unused new tab

The URL is a new-tab page (`chrome://newtab/`, `chrome://new-tab-page/`,
`about:blank`, the Edge/Brave/Vivaldi/Opera equivalents, or nothing committed
yet) **and** none of these protections apply:

| Protection | Why |
| --- | --- |
| pinned | pinning is deliberate |
| active in its window | never close what you are looking at |
| audible | something is playing |
| in a tab group | group membership implies intent |
| the only tab in its window | closing it would close the window |
| the review page itself | self-preservation |

Protected tabs are always **listed with their reasons** rather than silently
skipped, so the rules stay visible and tunable. All of them live in
`src/lib/config.js`.

### Known limitation

Chrome exposes no per-tab navigation history, so "never used" is not directly
observable. A tab that was used and then navigated *back* to a new tab page is
indistinguishable from a fresh one. The URL heuristic is the strongest signal
available without additional permissions. `lastAccessed` is shown as context —
it is never used as a filter.

## What counts as a duplicate

`http`/`https` tabs are grouped by a normalized URL: fragment dropped, tracking
parameters stripped (`utm_*`, `fbclid`, `gclid`, `ref`, …), remaining query
parameters sorted, trailing slash and default port dropped, host lowercased.

Deliberately conservative: `http` ≠ `https`, `www.example.com` ≠ `example.com`,
and paths stay case-sensitive. Both are one flag each in `src/lib/config.js`.

Each group suggests a keeper (pinned → active → most recently used → first in
window order) and lists the rest. **Nothing is closed and nothing is even
pre-selected** — selection and closing are a later iteration.

## Dry run, and how to graduate

Three independent layers keep this build harmless:

1. `DRY_RUN = true` is a constant in `src/lib/config.js`. There is no UI toggle
   and no stored setting, so nothing a user clicks can turn it off.
2. `src/lib/execute.js` logs what it would close and returns
   `{ closed: 0, wouldClose: [...] }`. The live branch is not written — it
   throws. Flipping the flag does not delete anything.
3. `test/guards.test.js` fails the suite if any tab-closing call appears
   anywhere in `src/`, and asserts the manifest still requests no permissions.

Because that guard matches `.remove(` in general, the DOM code uses
`replaceChildren()` and `classList.toggle(name, on)` rather than
`element.remove()` and `classList.remove()`. Keep it that way.

### Graduation checklist

Do not write the live close path until all of these hold:

- [ ] `npm test` passes.
- [ ] Dry run exercised against a real browser with several windows and 50+ tabs.
- [ ] Every protection verified to fire: pinned, active, audible, grouped, sole
      tab in window.
- [ ] A full dry-run report audited tab by tab — every id listed under "would
      close" confirmed to be genuine junk, with zero false positives.
- [ ] Behaviour confirmed after revoking the permission (must prompt, never
      produce a bogus plan).
- [ ] The change to `execute.js` reviewed deliberately, with undo behaviour
      (Chrome's "Reopen closed tab") considered.

## Development

```sh
npm test    # node --test, no dependencies
```

No build step, no runtime dependencies, no framework — plain ESM loaded directly
by the browser. All decision logic is pure functions over plain `Tab`-shaped
objects in `src/lib/url.js` and `src/lib/scan.js`, which is why `node --test`
can import them without a browser or a mock of the `chrome` global.

```
manifest.json
src/
  lib/
    config.js        every tunable, no logic
    url.js           isNewTabUrl(), normalizeUrl()        — pure
    scan.js          planCleanup() -> the whole plan      — pure
    execute.js       dry-run stub; cannot close a tab
    chrome-tabs.js   the only file that calls chrome.tabs
    permissions.js   optional-permission handling
    format.js        display helpers + markdown report    — pure
  popup/             button, counts, protected list
  review/            full-page duplicate groups (read-only)
test/                url · scan · format · guards
```
