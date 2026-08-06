# Tab Cleanup

A Chromium extension (Brave, Edge, Vivaldi, Chrome) that finds junk tabs across
all your windows. One button, **Clean up my tabs**, runs a single scan that
produces two results:

- **Unused new tabs** — new-tab pages that were opened and never navigated.
- **Duplicate tabs** — groups of tabs pointing at the same page.

> **This build cannot close a tab.** It is in a dry-run development phase: it
> reports what it *would* close and closes nothing. See
> [Dry run](#dry-run-and-how-to-graduate) below.

**[FEATURES.md](FEATURES.md) is the precise description of what this build
does** — read that before installing. The rest of this file is how and why it is
built that way.

## Install (unpacked)

The target browsers are **Brave** and **Edge**. Everything is plain MV3, so it
should work in any Chromium browser; Chrome simply is not what this is built for.
Note that Brave reports `chrome://newtab/` to the extensions API despite showing
`brave://` in the address bar, so the Chromium-internal URLs do matter.

| Browser | Extensions page |
| --- | --- |
| Edge | `edge://extensions` |
| Brave | `brave://extensions` |

1. Open the extensions page for your browser
2. Turn on **Developer mode**
3. **Load unpacked** → select this repository's root folder

**The extension asks for one permission: `tabs`.** Your browser will describe it
as *"Read your browsing history"*. That wording is alarming and worth
understanding before you install — see below.

### How to check what it actually got

Loading unpacked never shows the install dialog, so what you see (or don't see)
during step 3 proves nothing. Check directly:

extensions page → **Details** on the Tab Cleanup card → **Permissions**

Expect exactly one entry, and no host permissions. `test/guards.test.js` asserts
the cause (`manifest.json` declares `tabs` and nothing else, no host permissions,
no content scripts); the Details page is where you confirm the browser agrees.

## Permissions: why "Read your browsing history"

`manifest.json` declares exactly this:

```json
"permissions": ["tabs"]
```

The warning is real, but it is broader than what the extension does. Here is the
mechanism, because the naming is genuinely misleading.

`chrome.tabs.query()`, `chrome.tabs.create()`, `chrome.tabs.getCurrent()` — and
even `chrome.tabs.remove()` — require **no permission at all**. You can close
tabs without asking for anything. The `tabs` permission does one thing: it
un-redacts four fields on the `Tab` objects those calls return — `url`,
`pendingUrl`, `title` and `favIconUrl`.

Chromium shows a warning for any permission that carries a warning string, and
`tabs` carries the same one as the `history` permission. The reasoning is sound:
an extension holding `tabs` can read the url and title of every tab, in every
window, continuously — including on every navigation via `tabs.onUpdated`. That
is a live feed of browsing activity, whether or not an extension uses it that
way. This one reads urls at the moment you click the button, keeps nothing, and
has no network access and no storage permission.

**Alternatives, and why they do not work here:**

| Option | Why not |
| --- | --- |
| `activeTab` | No warning at all, but covers only the current tab after a click. Finding duplicates *across windows* needs every tab. |
| Narrow host permissions | Would reveal urls only on listed sites — useless for a general duplicate scan, and `chrome://newtab/` accepts no host permission at all. |
| `<all_urls>` | Reveals urls, but also grants reading and changing page content. Strictly worse. |
| Drop it entirely | Leaves `url`/`title` empty. The scan cannot identify a new tab or a duplicate. |

So `tabs` is the genuine minimum for these two features. Every comparable
extension (OneTab, Tab Wrangler) asks for at least the same.

It was *optional* until 2026-08-06, requested on first click. That was dropped:
the identical warning fired either way, just as a mid-session dialog instead of
at install — the same disclosure, delivered more annoyingly.

One consequence worth knowing: if you revoke `tabs` from the Details page,
`tab.url` becomes `undefined` rather than `''`. Left unguarded every tab would
look like a blank new tab, so `planCleanup()` throws `MissingTabsPermissionError`
rather than producing a catastrophically wrong plan.

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
   anywhere in `src/`, and asserts the manifest requests `tabs` and nothing
   else — no host permissions, no content scripts.

The guard matches the patterns that reach `chrome.tabs.remove`: `tabs.remove`,
`tabs[...]`, `chrome['tabs'].remove`, and destructuring `remove` off `tabs`.
Ordinary DOM calls are fine.

It previously banned `.remove(` outright, which also forbade `element.remove()`
and `classList.remove()`. That was removed on 2026-08-06 — it distorted the UI
code while still missing `chrome.tabs['remove']()`, so it cost readability and
bought no safety. The existing `replaceChildren()` / `classList.toggle(name, on)`
usage was left as-is because it is good modern DOM, not because it is required.
Layer 2 is what actually holds.

### Graduation checklist

Do not write the live close path until all of these hold:

- [ ] `npm test` passes.
- [ ] The Details page confirms `tabs` and no host permissions.
- [ ] Dry run exercised against a real browser with several windows and 50+ tabs.
- [ ] Every protection verified to fire: pinned, active, audible, grouped, sole
      tab in window.
- [ ] A full dry-run report audited tab by tab — every id listed under "would
      close" confirmed to be genuine junk, with zero false positives.
- [ ] Behaviour confirmed after revoking the permission (must prompt, never
      produce a bogus plan).
- [ ] The change to `execute.js` reviewed deliberately, with undo behaviour
      (the browser's "Reopen closed tab") considered.

## Development

```sh
npm test    # node --test, no dependencies
```

### Testing in a browser

Partly automatable. The `--load-extension` switch was disabled in
**Chrome-branded** builds at version 137, but not in Chromium — so Brave, Edge
and Playwright's bundled Chromium all still honour it. Playwright can load the
extension and drive its pages, pointed at the real browser via `executablePath`.
Verified end-to-end against Brave 1.93.132 and Edge on 2026-08-06.

What automation cannot do: click native browser dialogs, and judge whether a
flagged tab was really junk. See [TESTING.md](TESTING.md) for both the scripted
recipe and the manual plan.

The short version:

1. **Constructed scenario** — one pinned new tab, one in a tab group, one
   playing audio, one alone in its own window, one active. Every protection
   should fire exactly once and appear with its reason.
2. **Your real browser**, where the actual tab mess lives. This surfaces false
   positives a constructed scenario cannot, and the dry run makes it safe.

The popup closes when it loses focus, which makes its console hard to reach.
Right-click the popup → **Inspect** pins it open; `[dry-run] would close [...]`
is logged there. **⧉ Copy report** puts the whole scan on the clipboard as
markdown — that is the artifact to bring back for tuning.

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
    permissions.js   permission check (tabs is required, never prompts)
    format.js        display helpers + markdown report    — pure
  popup/             button, counts, protected list
  review/            full-page duplicate groups (read-only)
test/                url · scan · format · guards
```
