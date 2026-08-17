---
id: TASK-10
title: Add popup help button explaining Scan my tabs vs Vacuum em all
status: Done
assignee: []
created_date: '2026-08-17 05:54'
updated_date: '2026-08-17 05:57'
labels: []
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The popup has two buttons with meaningfully different reach and risk — 'Scan my tabs' only reports, 'Vacuum em all!' closes tabs in two clicks — and nothing in the UI explains that difference to a first-time user. This was built once on the now-closed feature/popup-enhancements-and-webstore branch (PR #8, commits b30745a and 0265175: a hoverable/focusable '?' button in the popup header with a popover explaining both buttons, plus accessible title/aria-label tooltips on the buttons themselves) but was never carried forward when that PR was closed for unrelated architectural conflicts. Re-land it adapted to main's current popup.js, which already has the vacuum-list confirm preview (PR #3) and the force-disable fix (PR #10) that did not exist when the original was written.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A '?' button in the popup header shows a popover on hover and on keyboard focus, explaining what 'Scan my tabs' and 'Vacuum em all!' each do
- [x] #2 The popover and button are reachable and dismissable by keyboard alone (Tab to focus, popover shows; Tab away or blur, popover hides) — not mouse-only
- [x] #3 Scan my tabs and Vacuum em all! carry accessible title and aria-label text describing what a click does, including while Vacuum is armed
- [x] #4 No change to what either button actually does when clicked — this is discoverability only
- [x] #5 npm test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Port the .help-container/.help-btn/.help-popover CSS from the closed PR #8 branch (commit 0265175) into src/popup/popup.css unchanged.
2. Add the '?' button and popover markup to popup.html's header, refreshing the copy to match current behavior (Vacuum 'em all! now lists targets when armed, per PR #3/#10 work that postdates the original).
3. Wire popup.js: SCAN_TOOLTIP/SCAN_AGAIN_TOOLTIP/VACUUM_TOOLTIP constants, title+aria-label on scan/vacuum buttons set at every state transition (initial, armed via armVacuum(result), disarmed, scan-again via render()), and hover/focus/blur listeners on #help-btn toggling aria-expanded for screen readers.
4. Verify visually with a headless Brave screenshot (no claude-in-chrome available in this session) — default state, and a throwaway CSS-forced-open copy for the popover content — rather than skipping visual verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified visually via headless Brave screenshots (claude-in-chrome not connected in this background session): default header renders the (?) button correctly, and a throwaway static copy with .help-popover forced visible confirmed the popover text, positioning, and width all render legibly within the 350px popup. npm test: 90/90.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a '?' help button in the popup header with a hoverable/focusable popover explaining Scan my tabs vs Vacuum em all!, plus accessible title/aria-label tooltips on both buttons that update across every state (idle, scanning, armed, scan-again). Re-landed from the closed PR #8 branch, adapted to main's current armVacuum(result)/vacuumList preview and refreshVacuumState() (neither existed when the original was written). Verified with headless Brave screenshots (both the default header and a forced-open popover) since claude-in-chrome wasn't connected this session. npm test: 90/90. No behavior change to either button's click handler.
<!-- SECTION:FINAL_SUMMARY:END -->
