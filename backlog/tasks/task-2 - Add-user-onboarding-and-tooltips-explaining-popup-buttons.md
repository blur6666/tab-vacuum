---
id: TASK-2
title: Add user onboarding and tooltips explaining popup buttons
status: Done
assignee:
  - '@antigravity'
created_date: '2026-08-16 13:58'
updated_date: '2026-08-17 04:36'
labels: []
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Help new users understand what the action buttons do on first access through tooltips or onboarding hints explaining the difference between 'Scan my tabs' (inspect & review) and 'Vacuum em all!' (instant scan and cleanup with 2-click confirm).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add informative tooltips or first-time onboarding hints to 'Scan my tabs' and 'Vacuum em all!' buttons
- [x] #2 Explain the difference between inspecting/reviewing tabs vs instant vacuum cleanup
- [x] #3 Ensure first-access onboarding hints can be dismissed or do not obstruct regular button usage
- [x] #4 Maintain accessible tooltip and ARIA labels across the popup UI
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add first-time onboarding hint banner to popup.html explaining Scan vs Vacuum workflows.
2. Add dismiss action that saves state in localStorage without blocking normal button usage.
3. Enhance button tooltips and ARIA attributes for #scan and #vacuum.
4. Update popup.css with styling that fits light/dark themes and maintains compact layout.
5. Update popup.js to manage onboarding dismiss state and tooltip updates across button states.
6. Verify accessibility and run test suite with npm test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented first-time onboarding card in popup.html/popup.css with localStorage persistence and dismiss control. Added informative tooltips and ARIA labels for Scan my tabs and Vacuum em all buttons with dynamic state updates. Verified via 86 unit and structural guard tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added user onboarding banner and dynamic accessible tooltips/ARIA labels to popup action buttons. Verified with npm test suite.
<!-- SECTION:FINAL_SUMMARY:END -->
