---
id: TASK-8
title: Kill 'Em All should say when it will close whole windows
status: To Do
assignee: []
created_date: '2026-08-16 19:52'
labels: []
dependencies: []
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CODE-REVIEW.md finding 7. bulkSelection() includes non-keeper duplicates regardless of closesWindow. That is a documented decision — CLAUDE.md rule 5 keeps soleTabInWindow out of NEVER_CLOSE deliberately, warned about in the UI rather than forbidden — and per row the warning exists at src/review/review.js (the '⚠ closes its window' branch). But Kill 'Em All ticks every such row at once and confirms with a bare count, so a user is told 'Kill 14? — click again' with no indication that some of those fourteen take their windows with them, and the pre-ticked rows carrying the warning may be scrolled off screen. The per-row warning was designed for per-row decisions. Keep the decision, restore the disclosure: extend the armed prompt when the selection contains any tab with closesWindow, e.g. 'Kill 14 (2 close their window)? — click again'. Compare with the Vacuum confirm, which now lists its targets outright — the same principle applied one level down.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the bulk selection contains tabs with closesWindow, the armed Kill 'Em All prompt says how many
- [ ] #2 The prompt is unchanged when no selected tab closes a window
- [ ] #3 The existing documented decision stands — closesWindow still does not become a hard protection
- [ ] #4 A test covers the prompt text in both cases
<!-- AC:END -->
