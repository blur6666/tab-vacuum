---
id: TASK-6
title: Make npm run package work outside Windows
status: To Do
assignee: []
created_date: '2026-08-16 19:52'
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
- [ ] #1 npm run package produces a valid zip on Linux and macOS as well as Git Bash on Windows
- [ ] #2 The PowerShell path is kept for Git Bash rather than replaced
- [ ] #3 The zip contains exactly manifest.json, the four icons and src/ — no test/, no .md, no package.json, no dotfiles
- [ ] #4 README's packaging section states any remaining platform requirement, or states that there is none
<!-- AC:END -->
