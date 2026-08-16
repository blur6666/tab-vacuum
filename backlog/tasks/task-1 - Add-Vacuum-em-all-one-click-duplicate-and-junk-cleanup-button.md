---
id: TASK-1
title: Add 'Vacuum em all!' one-click duplicate and junk cleanup button
status: Done
assignee: []
created_date: '2026-08-16 02:21'
updated_date: '2026-08-16 02:24'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a red button next to 'Scan my tabs' in the popup that scans and deletes duplicate non-keepers and junk tabs using broader detection rules after a two-click confirmation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Red 'Vacuum em all!' button is placed next to 'Scan my tabs' in the popup
- [x] #2 Uses broader junk detection rules (new tabs, extension/internal pages, error pages, auth/transactional pages) without affecting the standard 'Scan my tabs' analysis
- [x] #3 First click scans tabs and arms the button with a confirmation prompt showing the tab count (e.g. 'Closing 4 tabs, ok?')
- [x] #4 Second click executes closing of the duplicates and junk tabs via safe revalidation
- [x] #5 If not confirmed within the timeout, the button reverts to its default state
- [x] #6 Unit tests cover all broader junk detection rules and vacuum planning logic
- [x] #7 Architectural guards pass (only chrome-tabs.js touches tabs API)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/lib/junk-rules.js with detectJunk, detectNewTabOrExtension, detectErrorPage, detectAuthOrTransactional, isBlockedByPrivacy, isScriptableUrl.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All 81 tests passing including 11 new tests covering junk-rules, vacuum planning, and execution revalidation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented red 'Vacuum em all!' button with broader junk detection rules (new tabs, internal/extension pages, error pages, auth/transactional pages), duplicate non-keeper resolution, two-click confirmation workflow, and safe tab closure revalidation. Verified with 81 passing automated tests.
<!-- SECTION:FINAL_SUMMARY:END -->
