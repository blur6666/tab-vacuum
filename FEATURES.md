# What Tab Cleanup does

A precise description of the current build, written to be read **before**
installing. It describes behaviour that exists today, not the roadmap.

> **This build cannot close a tab.** It lists; it never acts.

## One button, one scan

Open the popup, click **Clean up my tabs**. The extension reads every tab in
every normal window once and produces two results. Nothing runs in the
background — there is no service worker, and no scan happens unless you click.

Excluded from the scan entirely:

- **Incognito tabs** — skipped, and the count of skipped tabs is reported.
- **Non-normal windows** — devtools, app and popup windows are not tabs a user
  cleans up.

## Result 1 — unused new tabs

A tab qualifies when its URL is a new-tab page: `chrome://newtab/`,
`edge://newtab/`, `about:blank`, one of the other Chromium-family variants, or
nothing committed yet.

Both the current URL **and** the pending URL must be new-tab pages. A tab
part-way through navigating to real content is never a candidate.

A qualifying tab is **excluded and shown separately with its reason** when any
of these hold:

| Protection | Reason shown |
| --- | --- |
| Pinned | `pinned` |
| Active in its window | `active` |
| Playing audio | `audible` |
| In a tab group | `grouped` |
| The only tab in its window | `only tab in window` |
| The extension's own review page | `extension page` |

Protected tabs are always listed rather than silently dropped, so the rules stay
visible and can be tuned in `src/lib/config.js`.

New-tab pages take no part in duplicate detection — a tab is counted under this
result or the next one, never both.

## Result 2 — duplicate tabs

Only `http` and `https` tabs participate. They are grouped by a normalised URL:

- fragment (`#…`) dropped
- tracking parameters stripped — `utm_*`, `fbclid`, `gclid`, `ref`, `ref_src`,
  `mc_cid`, `mc_eid`, `igshid`
- remaining query parameters sorted
- trailing slash and default port dropped, host lower-cased

Deliberately conservative: `http` ≠ `https`, `www.example.com` ≠ `example.com`,
and paths stay case-sensitive. Each is a single flag in `src/lib/config.js`.

Only groups of two or more are reported, largest group first. Each group
suggests one tab to keep (marked ★), chosen in this order:

1. pinned
2. active
3. most recently used
4. earliest in window order

Ties break deterministically by tab index, then window id, then tab id — the
same input always produces the same suggestion.

Groups open in a full-page, read-only review page.

## What it does not do

- **It closes nothing.** Neither unused new tabs nor duplicates. The close
  function returns `{ closed: 0, wouldClose: [...] }` and logs
  `[dry-run] would close [...]` to the console. No live close path is written.
- **No selection.** Duplicates cannot be ticked or acted on. That is a later
  iteration.
- **No persistence.** No `storage` permission, no history between runs, no
  service worker holding state. The review page re-runs the scan on load rather
  than receiving a snapshot.
- **No network access.** Nothing is sent anywhere.
- **No page access.** No host permissions and no content scripts, so it cannot
  read or change the contents of any page.

## Permission and data handling

Exactly one permission: **`tabs`**, which your browser describes as *"Read your
browsing history"*.

That permission exists solely to un-redact `url`, `pendingUrl`, `title` and
`favIconUrl` on tab objects. Reading URLs is the entire feature — without it the
scan cannot tell a new tab from a duplicate from anything else. The tab
operations themselves (`query`, `create`, `getCurrent`, and even `remove`)
require no permission at all.

The warning is broad because the permission is broad: anything holding `tabs`
*could* watch every navigation continuously. This extension reads URLs at the
moment you click, keeps nothing, and has no way to transmit anything.

The one path by which data leaves is **⧉ Copy report**, which places a markdown
report of the scan on your clipboard. You trigger it; it goes nowhere else.

If you revoke `tabs` from the extension's Details page, the scan refuses to run
and says so — it does not fall back to an empty or wrong plan.

## Known limitation

Chromium exposes no per-tab navigation history, so "never used" is not directly
observable. **A tab you used and then navigated back to a new-tab page is
indistinguishable from a fresh one.** The URL is the strongest signal available
without additional permissions, which is why this result is a suggestion rather
than a verdict. `lastAccessed` is displayed as context and is never used as a
filter.

---

Heuristics and thresholds: `src/lib/config.js`. Why the permission is what it is:
[README.md](README.md#permissions-why-read-your-browsing-history). Test plan:
[TESTING.md](TESTING.md).
