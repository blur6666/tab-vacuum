# Privacy Policy — Tab Vacuum

_Last updated: 6 August 2026_

## Summary

Tab Vacuum does not collect, store, transmit, or sell any data. There is no account, no sync, no analytics, and no server — the extension has no way to send information anywhere, because it makes no network requests at all.

## What the extension reads

When you click **Scan my tabs** or **Vacuum 'em all!**, Tab Vacuum reads the following from the tabs open in your normal browser windows:

- the tab's URL and title, to identify duplicate tabs and unused new-tab pages
- the tab's window, index, and tab-group id, to group and order the results
- whether the tab is pinned, playing audio, or the only tab in its window, so those tabs can be protected from closing
- the tab's last-accessed timestamp, shown as context in the results

This requires the `tabs` permission, which Chrome describes as *"Read your browsing history"*. That warning string is broader than what this extension does: `tabs` is simply the permission that stops Chrome from redacting `tab.url` and `tab.title`, and reading those is the entire feature.

## What happens to that information

It is held in memory for the duration of the scan and used to render the results on screen. It is never written to disk, never placed in browser storage, never logged, and never sent anywhere.

The extension declares no `storage` permission and saves no tab history to disk. Cleanup runs in the popup, and its results are discarded when the popup closes. The optional 15-minute auto-vacuum runs in the extension's background worker, scans in memory exactly as the popup does, and keeps nothing between runs; the only thing the browser stores is the timer itself. The review page re-runs its scan when it loads rather than receiving a saved copy.

## Network access

None. Tab Vacuum makes no HTTP requests, loads no remote scripts or fonts, contacts no analytics or crash-reporting service, and includes no tracking of any kind. All code is contained in the extension package.

## Page content

Tab Vacuum declares no host permissions and injects no content scripts, so it cannot read, modify, or interact with the contents of any web page you visit. It sees a tab's address and title, never what is inside it.

## The one way information leaves the extension

The **⧉ Copy report** button copies a plain-text report of the scan — including tab URLs and titles — to your system clipboard. This happens only when you click that button, the data goes only to your own clipboard, and nothing is transmitted. Paste it wherever you choose, or don't use the button at all.

## Optional permission

`tabGroups` is optional and is never requested unless you click **Show group names**. It is used only to display a tab group's name and colour in the results instead of a generic number. Declining it costs nothing but those labels.

## Permissions in full

- `tabs` — required. Reads tab URLs and titles so duplicates and unused new tabs can be identified.
- `alarms` — required. Runs the optional auto-vacuum every 15 minutes while you have it switched on. No install warning.
- `tabGroups` — optional. Displays tab-group names and colours.

No host permissions. No content scripts. No `storage`. No remote code.

## Children

Tab Vacuum is not directed at children and collects no data from anyone, including children.

## Changes to this policy

Any change will be published in this file in the extension's public repository, with the date above updated.

## Contact

Questions about this policy: open an issue at <https://github.com/blur6666/browser-extensions-tab-vacuum/issues>.
