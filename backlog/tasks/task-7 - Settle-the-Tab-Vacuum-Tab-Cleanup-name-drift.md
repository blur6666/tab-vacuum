---
id: TASK-7
title: Settle the Tab Vacuum / Tab Cleanup name drift
status: To Do
assignee: []
created_date: '2026-08-16 19:52'
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
- [ ] #1 One name is chosen and used in manifest.json, both page titles, the popup h1, both permission-denied strings, the markdown report heading, README and PRIVACY.md
- [ ] #2 README's Playwright recipe matches the name the manifest actually declares
- [ ] #3 scripts/browser-verify/ no longer needs to match two names
<!-- AC:END -->
