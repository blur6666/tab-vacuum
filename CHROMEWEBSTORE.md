# Chrome Web Store Listing — Tab Vacuum

> Last Updated: 2026-08-17

## Store Listing

**Extension Name** [REQUIRED]
Tab Vacuum

**Short Description** [REQUIRED]
Find unused new-tab pages and duplicate tabs across all your windows and clean them.

**Detailed Description** [REQUIRED]
Tab Vacuum helps you quickly find and clean up tab clutter across all open windows.

Key Features:
- Safe Tab Inspection: Scan all open windows to view duplicate tabs, unused blank new-tab pages, and browser system pages without closing anything.
- Intelligent Deduplication: Duplicate tabs are detected and grouped across windows while respecting tab groups and keeping the most relevant tab in each group.
- Vacuum 'em all! One-Click Cleanup: Immediately close unused new tabs, system tabs, and duplicate non-keepers across all windows, then see the tabs closed or skipped without the scan breakdown.
- Interactive Review: Open a dedicated review page to inspect tabs one by one, filter by deletion candidates, or select specific groups. Review-page close actions use a two-click confirmation.
- Multi-Layer Protection: Pinned tabs, tabs playing audio, grouped tabs, and sole tabs in windows are automatically protected and flagged with clear warnings.
- 100% Private & Local: No network requests, no remote scripts, no saved tab history, and no data tracking.

How to Use:
1. Click the Tab Vacuum icon in your toolbar to open the popup.
2. Click "Scan my tabs" to inspect your open tabs and see a breakdown of duplicates, unused new tabs, and system pages.
3. Click "Review & clean →" to manage tabs individually and use Kill 'Em All, or click "Vacuum 'em all!" in the popup for immediate one-click cleanup and a list of closed or skipped tabs.

Safety & Permissions:
Tab Vacuum requires the "tabs" permission exclusively to read tab URLs and titles for duplicate detection and to close the tabs you choose. Tab Vacuum never inspects page content, stores no history, and sends zero data over the network.

Support & Feedback:
Open-source on GitHub: https://github.com/blur6666/browser-extensions-tab-vacuum

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Scans open browser windows to safely identify and clean up duplicate tabs, abandoned blank new tabs, and unwanted system pages.

**Primary Language** [REQUIRED]
English


## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ⬜ To capture | Popup overview with scan breakdown and action buttons |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ⬜ To capture | Detailed review page with grouped duplicates and protections |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ⬜ To capture | Closed/skipped tab list after Vacuum, with no scan breakdown |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Optional | `assets/promo-small.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Optional | `assets/promo-marquee.png` |

### Screenshot Notes
- **Screenshot 1 (Popup View):** Show the clean popup interface showing scanned counts for unused new tabs, system tabs, and duplicates, with the "Vacuum 'em all!" and "Scan my tabs" actions.
- **Screenshot 2 (Review Page):** Show the full review interface displaying grouped duplicates across windows with keeper stars (★), protected tab notices (⚠), and group color chips.
- **Screenshot 3 (Vacuum Results):** Show the tabs closed or skipped after one-click Vacuum, with no scan breakdown.


## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `tabs` | permissions | Required to read tab URLs, titles, window IDs, and statuses (pinned, audible) across open windows to detect duplicate and abandoned tabs, and to close tabs selected by the user. No page content is read, and no tab data is persisted or transmitted off-device. |
| `alarms` | permissions | Schedules the optional Auto-vacuum run about every 5 minutes. No alarm exists while the feature is off. |
| `storage` | permissions | Stores a single boolean: whether Auto-vacuum is on. No tab data is stored. |
| `tabGroups` | optional_permissions | Optional cosmetic permission used solely to read and display custom tab group titles and colors in the review results. Tab deduplication functions fully even if this permission is declined. |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

Tab Vacuum does not collect, record, log, or transmit any user data. All scanning and deduplication algorithms execute locally in ephemeral browser memory and are discarded when the popup or review tab is closed.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | None | No |
| Health info | No | No | None | No |
| Financial info | No | No | None | No |
| Authentication info | No | No | None | No |
| Personal communications | No | No | None | No |
| Location | No | No | None | No |
| Web history | No | No | None | No |
| User activity | No | No | None | No |
| Website content | No | No | None | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes


## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/blur6666/browser-extensions-tab-vacuum/blob/main/PRIVACY.md


## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free


## Developer Info

**Publisher Name** [REQUIRED]
Tab Vacuum Contributors

**Contact Email** [REQUIRED]
(Configured in Chrome Developer Dashboard)

**Support URL / Email** [RECOMMENDED]
https://github.com/blur6666/browser-extensions-tab-vacuum/issues

**Homepage URL** [RECOMMENDED]
https://github.com/blur6666/browser-extensions-tab-vacuum


## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.1.0 | 2026-08-17 | Initial release: popup scan & report, full review page, and bulk cleanup actions. | Draft |


## Review Notes

### Known Issues / Limitations
- None. Manifest V3 compliant, local cleanup, no persistent tab history, minimal permissions.
