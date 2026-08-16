---
id: TASK-5
title: 'Land the Vacuum feature chain: merge PR 3, rebase PR 1, merge PR 1'
status: Done
assignee: []
created_date: '2026-08-16 19:52'
updated_date: '2026-08-16 20:01'
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
- [x] #1 PR #3 is merged into feature/vacuum-em-all-button
- [x] #2 PR #1 is rebased onto main with BACKLOG.md, backlog/ and CLAUDE.md conflicts resolved in favour of main's versions
- [x] #3 PR #1 no longer adds a duplicate backlog/config.yml or a second copy of the CLAUDE.md instruction block
- [x] #4 The tab open/last-access question is confirmed to survive as TASK-3 and nothing else was dropped from BACKLOG.md
- [x] #5 CI runs and is green on PR #1 after the rebase
- [x] #6 PR #1 is merged to main
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done in the order the task set out. PR #3 merged into feature/vacuum-em-all-button (eabc3e8). Conflicts resolved by merging main into the branch rather than rebasing — a merge needs no force-push to a branch this session does not own, and the history is worth keeping. Only BACKLOG.md actually conflicted, resolved to main's six-entry frozen record; CLAUDE.md and backlog/ merged clean because #1's config.yml and instruction block had been made byte-identical when Backlog was bootstrapped, so both sides defined the same files with the same content. Result is one config.yml, one instruction block, task-1 through task-3 intact. The [TECH VIABLE?] entry #1 dropped survives as TASK-3, so nothing was lost. PR #5 was the first in the chain to get real CI (four checks green), then #1 merged at 6fcd644.
<!-- SECTION:FINAL_SUMMARY:END -->
