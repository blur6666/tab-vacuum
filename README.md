# Tab Cleanup

A Chromium extension that finds junk tabs across all your windows: new-tab pages
you never used, and groups of tabs pointing at the same page.

> **This build cannot close a tab.** It reports what it *would* close and closes
> nothing.

**[FEATURES.md](FEATURES.md) describes exactly what this build does** — read it
before installing. This file is why it is built that way.

## Install (unpacked)

Built for **Brave** and **Edge**. Open `brave://extensions` or
`edge://extensions` → **Developer mode** → **Load unpacked** → this repository's
root folder.

It asks for one permission, `tabs`, which your browser calls *"Read your
browsing history"*. To see what it actually got: **Details** on the card →
**Permissions**. Expect that one entry and no host permissions. Loading unpacked
never shows an install dialog, so the Details page is the only real check.

## Permissions: why "Read your browsing history"

The warning is real, and broader than what the extension does. The mechanism is
worth understanding, because the naming is genuinely misleading.

`chrome.tabs.query()`, `create()`, `getCurrent()` — and even `remove()` —
require **no permission at all**. You can close tabs without asking for
anything. The `tabs` permission does exactly one thing: it un-redacts four fields
on the `Tab` objects those calls return — `url`, `pendingUrl`, `title` and
`favIconUrl`.

Chromium prompts for any permission carrying a warning string, and `tabs` carries
the same one as `history`. The reasoning is sound: anything holding `tabs` *can*
read the url and title of every tab in every window continuously, including on
every navigation via `tabs.onUpdated`. That is a live feed of browsing activity,
whether or not an extension uses it that way.

**Alternatives, and why none of them work here:**

| Option | Why not |
| --- | --- |
| `activeTab` | No warning at all, but covers only the current tab after a click. Finding duplicates *across windows* needs every tab. |
| Narrow host permissions | Reveal urls only on listed sites — useless for a general scan, and `chrome://newtab/` accepts no host permission at all. |
| `<all_urls>` | Reveals urls, but also grants reading and changing page content. Strictly worse. |
| Drop it entirely | Leaves `url` and `title` empty. The scan cannot identify a new tab or a duplicate. |

So `tabs` is the genuine minimum for these two features, and every comparable
extension (OneTab, Tab Wrangler) asks for at least the same.

It was *optional* until 2026-08-06, requested on first click. That was dropped
because the identical warning fired either way — the same disclosure, delivered
as a mid-session dialog instead of at install.

## Dry run, and how to graduate

Three independent layers keep this build harmless:

1. `DRY_RUN = true` is a constant in `src/lib/config.js`. No UI toggle, no stored
   setting — nothing a user clicks can turn it off.
2. `src/lib/execute.js` returns `{ closed: 0, wouldClose: [...] }` and logs what
   it would have closed. **The live branch is not written.** Flipping the flag
   deletes nothing.
3. `test/guards.test.js` fails the suite if any tab-closing call appears in
   `src/`, and asserts the manifest requests `tabs` and nothing else.

Layer 2 is the one that actually holds. Layer 3 is a regex and cannot be
airtight — see CLAUDE.md for what it does and does not catch.

### Graduation checklist

> **@blur6666 — review.** This checklist was written for something intended to
> ship. If this stays a personal tool, most of it is ceremony and the only rows
> that still earn their place are the false-positive audit and the revoked-
> permission check. Trim it, or keep it as-is?

Do not write the live close path until all of these hold:

- [ ] `npm test` passes.
- [ ] The Details page confirms `tabs` and no host permissions.
- [ ] Dry run exercised against a real browser with several windows and 50+ tabs.
- [ ] Every protection verified to fire: pinned, active, audible, grouped, sole
      tab in window.
- [ ] A full dry-run report audited tab by tab — every id listed under "would
      close" confirmed to be genuine junk, with zero false positives.
- [ ] Behaviour confirmed after revoking `tabs` from the Details page: it must
      refuse to scan, never produce a bogus plan.
- [ ] The change to `execute.js` reviewed deliberately, with undo behaviour
      (the browser's "Reopen closed tab") considered.

## Development

`npm test` — `node --test`, no dependencies. 36 tests over pure functions.

Browser testing is **partly** automatable: Brave and Edge still honour
`--load-extension`, so Playwright can load the extension and drive its pages.
See [TESTING.md](TESTING.md) for the recipe and the manual plan, and CLAUDE.md
for why that surprised us.

The popup closes when it loses focus, which makes its console hard to reach.
Right-click the popup → **Inspect** pins it open; `[dry-run] would close [...]`
is logged there. **⧉ Copy report** puts the whole scan on the clipboard as
markdown — that is the artifact to bring back for tuning.

Decision logic lives in `src/lib/url.js` and `src/lib/scan.js` as pure functions
over plain `Tab`-shaped objects, which is why `node --test` can import them
without a browser. Tunables are in `src/lib/config.js`. Architecture rules are in
CLAUDE.md.
