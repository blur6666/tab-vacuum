---
id: TASK-3
title: Can tab open time and last-access time drive a 'forgotten tabs' feature?
status: To Do
assignee: []
created_date: '2026-08-16 18:58'
labels: []
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Carried over from BACKLOG.md, where it was logged as [TECH VIABLE?]. Question, not a commitment: can the extension read when a tab was opened and when it was last accessed, as a way to surface forgotten or hoarded tabs? CLAUDE.md already records that Chromium exposes no per-tab navigation history and that lastAccessed is treated as context, never as a filter, so the answer may be no. Establish what is actually available before designing anything on top of it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Establish what chrome.tabs actually exposes: lastAccessed is present, but determine whether tab open time is available at all without the sessions permission
- [ ] #2 Decide whether any new permission would be required, and weigh it against the 'tabs is the permission ceiling' rule in CLAUDE.md
- [ ] #3 Answer viable or not viable in writing, with the reason, so the question is not reopened from scratch later
<!-- AC:END -->
