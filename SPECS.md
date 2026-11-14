# Project Invariants & Smoke Checklist

Run destructive checks only in a disposable browser profile with Tab Vacuum loaded. Smoke checks assume any fixture tabs mentioned are already open.

## [SCAN-01] Permission-safe scan scope
- **Invariant:** A scan refuses to produce a cleanup plan when tab URLs are unavailable, and excludes incognito and non-normal-window tabs.
- **Smoke Check:** In a disposable profile, scan with an incognito tab open and confirm it is absent from the report; revoke the extension's `tabs` access and scan again—the UI reports the missing permission instead of listing candidates.

## [CLASS-01] URL-based classification
- **Invariant:** New-tab and system-page candidates are identified from URLs, not titles or path guesses; a new-tab tab navigating to real content is not a candidate.
- **Smoke Check:** With an unused new tab, a loading tab navigating to a real page, a browser Settings page, and an article titled “404” open, scan: only the unused new tab is offered as junk, Settings is a system-page row, and the article and loading tab are not offered for closure.

## [DUPE-01] One keeper per normalized URL and tab group
- **Invariant:** Duplicate groups use normalized HTTP(S) URLs within each tab group, and each group retains one suggested keeper; bulk duplicate cleanup never selects that keeper or system tabs.
- **Smoke Check:** In a disposable profile, put two copies of one URL in a tab group and another copy in a different group; use Review → Kill ’Em All and confirm, then verify one copy remains in each group and an open Settings tab remains.

## [OFFER-01] Reported context is never actionable
- **Invariant:** Protected tabs remain visible with their reason and a disabled checkbox; context-only tabs remain report-only and cannot enter individual or bulk selections.
- **Smoke Check:** In Review, turn off “Only tabs up for deletion”; confirm an ordinary context row has no enabled checkbox and a protected row shows its reason with a disabled checkbox, then use a section’s select-all and confirm neither row becomes selected.

## [EXEC-01] Close-time revalidation
- **Invariant:** Every close path rechecks live tab identity, URL, navigation state, and applicable protections before closing; newly unsafe tabs are skipped and reported, and a batch of new/system tabs does not empty a window.
- **Smoke Check:** Select an eligible new tab in Review, click “Close selected” once, pin that tab before the confirming click, then confirm within three seconds; the tab remains open and the outcome reports it as skipped.

## [UI-01] Scan and cleanup controls stay distinct
- **Invariant:** Popup Scan only reports; popup Vacuum is the one-click cleanup path, preserves the active tab beneath the popup, and shows closed/skipped outcomes without the scan breakdown; Review close actions require a second click within three seconds.
- **Smoke Check:** With an eligible background candidate open, click Scan and confirm it remains open; click Vacuum and confirm the popup remains open with a closed/skipped result. In Review, click a close action once and confirm nothing closes until the second click.
