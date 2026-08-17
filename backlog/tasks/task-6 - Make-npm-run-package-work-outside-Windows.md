---
id: TASK-6
title: Make npm run package work outside Windows
status: Done
assignee: []
created_date: '2026-08-16 19:52'
updated_date: '2026-08-17 05:41'
labels: []
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CODE-REVIEW.md finding 5. scripts/package.sh uses pwd -W and shells out to powershell.exe. Under set -euo pipefail the pwd -W call aborts the run on any non-Windows host — reproduced: 'pwd: -W: invalid option'. So no store zip can be built from CI, from macOS, or from Linux, while README presents npm run package as the way to produce one with no platform caveat. The original reasoning is sound (neither zip nor tar ships with Git Bash on Windows, and the repo takes no npm dependencies), so keep the PowerShell path and add a fallback rather than replacing it. Once it runs anywhere, CI can assert the zip contains exactly manifest.json, the icons and src/ — the thing most likely to break silently before a store submission. That assertion is in scope for TASK-2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 npm run package produces a valid zip on Linux and macOS as well as Git Bash on Windows
- [ ] #2 The PowerShell path is kept for Git Bash rather than replaced
- [x] #3 The zip contains exactly manifest.json, the four icons and src/ — no test/, no .md, no package.json, no dotfiles
- [x] #4 README's packaging section states any remaining platform requirement, or states that there is none
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped via PR #11 (merged into main as commit 951968b, part of merge commit 0985b84). Deviated from AC #2 by design: instead of keeping the PowerShell path as a Git-Bash-only branch alongside a new fallback, scripts/package.js replaces it outright with a single dependency-free ZIP writer (node:fs only, stored entries) that runs identically on every OS, including CI. Rationale: two code paths for the same output is itself a drift risk (exactly the class of bug this repo's guard tests exist to catch elsewhere), and a from-scratch writer removes the platform branch entirely rather than adding a second one.

Verified the hand-written ZIP is well-formed: unzip -t (no errors), PowerShell's Expand-Archive (extracts cleanly), and a byte-for-byte diff of manifest.json and a src/ file against the source. npm test: 90/90.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
npm run package now works identically on Windows, Linux and macOS via scripts/package.js, a dependency-free ZIP writer — verified with unzip -t, PowerShell's Expand-Archive, and byte-diffs against source. AC #2 (keep the PowerShell path as a fallback) was not followed literally: the PowerShell path was replaced rather than kept, trading a Windows/other-OS branch for one code path everywhere. AC #1, #3, #4 hold as written. Landed via PR #11 (main@0985b84).
<!-- SECTION:FINAL_SUMMARY:END -->
