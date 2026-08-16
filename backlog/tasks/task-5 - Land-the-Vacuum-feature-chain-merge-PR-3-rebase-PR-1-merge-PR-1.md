---
id: TASK-5
title: 'Land the Vacuum feature chain: merge PR 3, rebase PR 1, merge PR 1'
status: To Do
assignee: []
created_date: '2026-08-16 19:52'
labels: []
dependencies: []
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #1 (feature/vacuum-em-all-button) adds the Vacuum em all! popup button. It was reviewed and blocked. PR #3 (claude/fix-vacuum-heuristics) targets PR #1's branch and clears both blockers: it narrows the junk heuristics to what a URL can prove, and implements the confirm listing that CLAUDE.md rule 2 now requires. Order matters. 1) Merge #3 into #1 — that is what clears the request-changes. 2) Rebase #1 onto main: it conflicts on BACKLOG.md, backlog/ and CLAUDE.md because PR #2 landed those on main after #1 branched. 3) Fix the two review items #3 did not touch: #1 silently deletes the [TECH VIABLE?] BACKLOG.md entry about tab open and access times (now migrated to TASK-3, so confirm nothing is lost rather than restoring it verbatim), and #1 bundles its own backlog/ tooling plus a CLAUDE.md instruction block that main already has — drop the duplicates during the rebase, keeping only its task-1 content. 4) Merge #1. Note #1 currently has no CI: .github/workflows/test.yml is on main and pull_request workflows are read from the head branch, so the rebase is also what gives it a real test run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PR #3 is merged into feature/vacuum-em-all-button
- [ ] #2 PR #1 is rebased onto main with BACKLOG.md, backlog/ and CLAUDE.md conflicts resolved in favour of main's versions
- [ ] #3 PR #1 no longer adds a duplicate backlog/config.yml or a second copy of the CLAUDE.md instruction block
- [ ] #4 The tab open/last-access question is confirmed to survive as TASK-3 and nothing else was dropped from BACKLOG.md
- [ ] #5 CI runs and is green on PR #1 after the rebase
- [ ] #6 PR #1 is merged to main
<!-- AC:END -->
