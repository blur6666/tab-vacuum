# Tab Vacuum

A Chromium extension that finds unused new tabs, browser system pages, and duplicate tabs across your windows.

## Install

Built for **Brave / Chromium 127+**. Should work on any chromium-based browser.
Install here: https://chromewebstore.google.com/detail/tab-vacuum/fljnkehfhjfjoaieadhcghojihcnngjl?authuser=0&hl=en

## Use

- **Scan my tabs** previews cleanup candidates without closing anything.
- **Vacuum 'em all!** immediately closes eligible new tabs, system tabs, and duplicate non-keepers.
- **Review & clean →** opens the full report for selective cleanup.
- **Close selected** and **Kill 'Em All** require a second click within three seconds.
- **Kill 'Em All** keeps one copy per duplicate group and excludes system tabs.
- **Only tabs up for deletion** hides context-only rows; untick it to see all scanned tabs.
- **Show group names** requests optional access to tab-group labels and colours.
- **Copy report** copies URLs and titles to your clipboard, including hidden context rows.

## Cleanup rules

- Incognito tabs and non-normal windows are excluded.
- New-tab and system pages are protected when pinned, audible, grouped, or alone in a window.
- Batch cleanup reserves one new-tab or system page when the selected candidates would otherwise empty its window.
- Duplicate tabs are protected when pinned or audible.
- Active tabs are eligible; closing a duplicate alone in its window also closes that window.
- Duplicates are matched within each tab group, using normalised HTTP(S) URLs.
- Matching removes fragments, tracking parameters, trailing slashes, and default ports, then sorts query parameters.
- Protocols, `www` prefixes, and path case remain distinct.
- Suggested keepers favour pinned, active, then recently used tabs.
- Tabs are rechecked before closing; changed or newly protected tabs are skipped.

**Limitation:** a used tab navigated back to a new-tab page looks like a fresh one.
Restore closed tabs with the browser’s **Ctrl+Shift+T**.

## Privacy and permissions

- **`tabs`** exposes tab URLs and titles; Chromium labels it “Read your browsing history.”
- **`tabGroups`** is optional and only adds group names and colours.
- No telemetry, network requests, page-content access, or persistent history.
- Scanning requires `tabs`; revoking it prevents scans.

## Development

- `npm test` — dependency-free Node test suite; requires Node 20.12+.
- `npm run package` — creates `tab-vacuum-<version>.zip` for the Chrome Web Store.
- `src/lib/config.js` — protections and URL-matching options.
- `src/lib/url.js` and `src/lib/scan.js` — core decision logic.
- `CLAUDE.md` — architecture and browser-testing guidance.