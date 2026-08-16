---
id: TASK-7
title: Settle the Tab Vacuum / Tab Cleanup name drift
status: Done
assignee: []
created_date: '2026-08-16 19:52'
updated_date: '2026-08-16 20:16'
labels: []
dependencies: []
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CODE-REVIEW.md finding 6. manifest.json and PRIVACY.md say 'Tab Vacuum'. Everything the user sees says 'Tab Cleanup': src/popup/popup.html title and h1, src/review/review.html title, the permission-denied strings in src/popup/popup.js and src/review/review.js, the markdown report heading in src/lib/format.js, and README's own title. Two concrete consequences, both observed rather than inferred. First, README.md's Playwright recipe says to find the extension id by matching name === 'Tab Cleanup' in chrome://extensions-internals/ — the manifest name is 'Tab Vacuum', so the documented recipe finds nothing; the scripts in scripts/browser-verify/ have to match both names to work at all. Second, a store listing whose in-product name differs from its manifest name is a routine review rejection. Pick one name and apply it everywhere, including the README recipe and the browser-verify scripts once the drift is gone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One name is chosen and used in manifest.json, both page titles, the popup h1, both permission-denied strings, the markdown report heading, README and PRIVACY.md
- [x] #2 README's Playwright recipe matches the name the manifest actually declares
- [x] #3 scripts/browser-verify/ no longer needs to match two names
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settled on Tab Vacuum, which was already the repo name, the manifest name, the package.json name, the PRIVACY.md name and the name in the button 'Vacuum em all!'. Tab Cleanup was the legacy name and survived only in user-facing strings. Renamed 11 occurrences across both page titles, the popup h1, both permission-denied strings, the markdown report heading, README and CLAUDE.md headings, and README's Playwright recipe — which previously matched name === 'Tab Cleanup' and so could never find the extension. scripts/browser-verify/ no longer needs its two-name fallback; verified in a real browser that a single-name match still resolves the extension id. CODE-REVIEW.md keeps the old wording on purpose: it is a dated report of main at 089ca85, not live documentation.
<!-- SECTION:FINAL_SUMMARY:END -->
