---
id: TASK-2
title: Plan the full CI
status: To Do
assignee: []
created_date: '2026-08-16 18:58'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The test workflow runs npm test on push and pull request, which closes the 'nothing runs the guards' gap and nothing more. It is a signal rather than a gate, and it covers only the pure functions: all 70 tests exercise plain objects, while popup.js and review.js have no automated coverage at all. Produce a plan, not an implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decide whether main gets branch protection requiring the test check, so a red run actually blocks a merge instead of being advisory
- [ ] #2 Decide whether Playwright drives the real extension in CI to cover popup.js and review.js, or whether the UI stays hand-tested
- [ ] #3 Rule on the zero-dependency constraint first, since it gates the rest: Playwright, ESLint and web-ext lint each require devDependencies and a lockfile, which is why CI currently has no install step
- [ ] #4 Decide how to make npm run package cross-platform so CI can build and verify a store zip contains exactly manifest.json, the icons and src/
- [ ] #5 Accept or explicitly reject each remaining candidate: node --check, experimental test coverage, CodeQL, Dependabot, pinning actions by SHA rather than tag, and a markdown check for the no-hard-wrap rule
- [ ] #6 State what CI deliberately will not do, so the human false-positive audit is not silently assumed to be automated
<!-- AC:END -->
