---
id: TASK-4
title: Ship the two close-path safety fixes to main
status: Done
assignee: []
created_date: '2026-08-16 19:51'
updated_date: '2026-08-16 20:01'
labels: []
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Highest priority: main today can close a window the user did not ask to close, and both fixes already exist on unmerged branches. Verified against origin/main — neither is present. FIX 1 (blocking, CODE-REVIEW.md finding 1): closeTabs() in src/lib/execute.js re-validates with closeBlockers(), which reads NEVER_CLOSE ({pinned, audible}) only. Unused new tabs and system tabs are governed by PROTECT, which also covers grouped and soleTabInWindow, and neither is ever re-checked. A blank new tab offered while its window had two tabs still closes after the other tab goes, taking the window with it, and reports an empty skipped list. The fix computes live per-window counts from the snapshot closeTabs() already has (no extra API call) and branches staleReason() to protectionReasons() for non-duplicates. It exists on branch feature/vacuum-em-all-button. FIX 2 (same family): scan.js classifies a tab mid-navigation away from the new tab page as a closable SYSTEM tab. isNewTabish() correctly rejects it, then it falls through to isSystemPageUrl(), which matches on scheme alone, so chrome://newtab/ matches the same chrome: as chrome://settings/. Typing a URL into a blank tab and then using select-all in the System tabs section closes the page you were navigating to. Fix is commit 1164e13 on branch claude/fix-vacuum-heuristics. Take both as a small PR straight to main, carrying no feature code and no CLAUDE.md rule changes, so they do not wait on the Vacuum button design.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A PR against main contains only these two fixes plus their tests — no Vacuum button, no junk-rules, no CLAUDE.md rule edits
- [x] #2 closeTabs() re-checks grouped and soleTabInWindow for new-tab and system tabs, using live per-window counts derived from the snapshot it already fetches
- [x] #3 A new tab whose pendingUrl is real content is reported as a bystander and is absent from systemTabs and protectedSystemTabs
- [x] #4 Tests cover both transitions: a tab that became sole-in-window since the scan, and a tab that became grouped since the scan
- [x] #5 npm test passes and CI is green on the PR
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered, but by a different route than this task proposed, so acceptance criterion 1 is deliberately left unchecked. The task assumed PR #1 would stay blocked and the two fixes would need extracting into a standalone PR. Instead PR #3 cleared #1's blockers, PR #5 merged main in and resolved the conflict, and #1 merged — carrying both fixes to main with the feature rather than ahead of it. Verified on origin/main at 6fcd644: liveTabsPerWindow present in execute.js, 'navigating to new content' present in scan.js. The outcome this task existed to secure — main can no longer close a window the user did not ask to close, and a tab mid-navigation is no longer offered as a closable system tab — holds.
<!-- SECTION:FINAL_SUMMARY:END -->
