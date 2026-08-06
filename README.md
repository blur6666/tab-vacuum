# Tab Cleanup

A Chromium extension that finds junk tabs across all your windows: new-tab pages you never used, and groups of tabs pointing at the same page.

> **This build cannot close a tab.** It is meant to report suggestions of possibly stale and obviously duplicated tabs, but leaves the burden to the user.

## Install (unpacked)

Built for **Brave**. Open `brave://extensions` → **Developer mode** → **Load unpacked** → this repository's root folder.

It asks for one permission, `tabs`, which your browser calls *"Read your browsing history"*. To see what it actually got: **Details** on the card → **Permissions**. Expect that one entry and no host permissions. Loading unpacked never shows an install dialog, so the Details page is the only real check.

That warning is broader than what the extension does, and the naming is genuinely misleading — [why it is unavoidable](#permissions-why-read-your-browsing-history) is worth reading before you install.

## One button click, one scan

Open the popup, click **Clean up my tabs**. The extension reads every tab in every normal window once and produces the two results below. Nothing runs in the background — there is no service worker, and no scan happens unless you click. WYSIWYG

Excluded from the scan entirely:

- **Incognito tabs** — skipped, and the count of skipped tabs is reported.
- **Non-normal windows** — devtools, app and popup windows are not tabs a user cleans up.

A tab is counted under one result or the other, never both: new-tab pages take no part in duplicate detection.

### Result 1 — unused new tabs

A tab qualifies when its URL is a new-tab page: `chrome://newtab/`, `edge://newtab/`, `about:blank`, one of the other Chromium-family variants, or nothing committed yet.

Both the current URL **and** the pending URL must be new-tab pages. A tab part-way through navigating to real content is never a candidate.

A qualifying tab is **excluded and shown separately with its reason** when any of these hold:

| Protection | Reason shown |
| --- | --- |
| Pinned | `pinned` |
| Active in its window | `active` |
| Playing audio | `audible` |
| In a tab group | `grouped` |
| The only tab in its window | `only tab in window` |
| The extension's own review page | `extension page` |

Protected tabs are always listed rather than silently dropped, so the rules stay visible and can be tuned in `src/lib/config.js`.

**Known limitation.** Chromium exposes no per-tab navigation history, so "never used" is not directly observable. **A tab you used and then navigated back to a new-tab page is indistinguishable from a fresh one.** The URL is the strongest signal available without additional permissions, which is why this result is a suggestion rather than a verdict. `lastAccessed` is displayed as context and is never used as a filter.

### Result 2 — duplicate tabs

Only `http` and `https` tabs participate. They are grouped by a normalised URL:

- anchors (`#…`) dropped
- tracking parameters stripped — `utm_*`, `fbclid`, `gclid`, `ref`, `ref_src`, `mc_cid`, `mc_eid`, `igshid`
- remaining query parameters sorted
- trailing slash and default port dropped, host lower-cased

Deliberately conservative: `http` ≠ `https`, `www.example.com` ≠ `example.com`, and paths stay case-sensitive. Each is a single flag in `src/lib/config.js`.

Only groups of two or more are reported, largest group first. Each group suggests one tab to keep (marked ★), chosen in this order:

1. pinned
2. active
3. most recently used
4. earliest in window order

Ties break deterministically by tab index, then window id, then tab id — the same input always produces the same suggestion. The suggestion is informational: the rest are listed, not selected, and nothing offers to close them.

Groups open in a full-page, read-only review page.

## What it does not do

- **It cannot close a tab.** Not new-tab pages, not duplicates. The close function returns `{ closed: 0, wouldClose: [...] }` and logs `[dry-run] would close [...]` to the console. No live close path is written — see [Dry run, and how to graduate](#dry-run-and-how-to-graduate).
- **No persistence.** No `storage` permission, no history between runs, no service worker holding state. The review page re-runs the scan on load rather than receiving a snapshot.
- **No network access.** Nothing is sent anywhere — no usage data, no telemetry.
- **No page access.** No host permissions and no content scripts, so it cannot read or change the contents of any page.

The one path by which data leaves is **⧉ Copy report**, which places a markdown report of the scan on your clipboard. You trigger it; it goes nowhere else.

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

It was *optional* until 2026-08-06, requested on first click. That was dropped because the identical warning fired either way — the same disclosure, delivered as a mid-session dialog instead of at install.

If you revoke `tabs` from the extension's Details page, the scan refuses to run and says so — it does not fall back to an empty or wrong plan.

## Dry run, and how to graduate

Three independent layers keep this build harmless:

1. `DRY_RUN = true` is a constant in `src/lib/config.js`. No UI toggle, no stored  setting — nothing a user clicks can turn it off.
2. `src/lib/execute.js` returns `{ closed: 0, wouldClose: [...] }` and logs what  it would have closed. **The live branch is not written.** Flipping the flag  deletes nothing.
3. `test/guards.test.js` fails the suite if any tab-closing call appears in  `src/`, and asserts the manifest requests `tabs` and nothing else.

Layer 2 is the one that actually holds. Layer 3 is a regex and cannot be airtight — see CLAUDE.md for what it does and does not catch.

### Graduation checklist

> **@blur6666 — review.** This checklist was written for something intended to
> ship. If this stays a personal tool, most of it is ceremony and the only rows
> that still earn their place are the false-positive audit and the revoked-
> permission check. Trim it, or keep it as-is?

Do not write the live close path until all of these hold:

- [ ] `npm test` passes.
- [ ] The Details page confirms `tabs` and no host permissions.
- [ ] Dry run exercised against a real browser with several windows and 50+ tabs.
- [ ] Every protection verified to fire: pinned, active, audible, grouped, sole tab in window.
- [ ] A full dry-run report audited tab by tab — every id listed under "would close" confirmed to be genuine junk, with zero false positives.
- [ ] Behaviour confirmed after revoking `tabs` from the Details page: it must refuse to scan, never produce a bogus plan.
- [ ] The change to `execute.js` reviewed deliberately, with undo behaviour (the browser's "Reopen closed tab") considered.

## Development

`npm test` — `node --test`, no dependencies. 36 tests over pure functions.

Browser testing is **partly** automatable: Brave and Edge still honour `--load-extension`, so Playwright can load the extension and drive its pages. See [TESTING.md](TESTING.md) for the recipe and the manual plan, and CLAUDE.md for why that surprised us.

The popup closes when it loses focus, which makes its console hard to reach. Right-click the popup → **Inspect** pins it open; `[dry-run] would close [...]` is logged there. **⧉ Copy report** puts the whole scan on the clipboard as markdown — that is the artifact to bring back for tuning.

Decision logic lives in `src/lib/url.js` and `src/lib/scan.js` as pure functions over plain `Tab`-shaped objects, which is why `node --test` can import them without a browser. Tunables — heuristics, thresholds, protections, normalisation flags — are in `src/lib/config.js`. Architecture rules are in CLAUDE.md.
