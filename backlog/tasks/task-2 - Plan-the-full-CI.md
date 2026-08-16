---
id: TASK-2
title: Plan the full CI
status: To Do
assignee: []
created_date: '2026-08-16 18:58'
updated_date: '2026-08-16 20:02'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The test workflow runs npm test on push and pull request, which closes the 'nothing runs the guards' gap and nothing more. It is a signal rather than a gate, and it covers only the pure functions: the unit tests exercise plain objects, while popup.js and review.js have no automated coverage. Produce a plan, not an implementation. UPDATE 2026-08-16: two things changed since this was written. First, scripts/browser-verify/ now exists on main and works — two scripts that load the extension unpacked in Chromium against a throw-away profile and drive the popup end to end. They are not wired into CI, and Playwright is deliberately not a dependency, so the plan still has to decide whether that changes. Second, there is now evidence rather than argument: both bugs found on 2026-08-16 passed the entire node --test suite and were caught only by running the real thing — a tab mid-navigation offered as a closable system tab, and the Vacuum confirm showing 7 rows of 33 because it inherited a 150px cap. Neither is reachable without a browser at real popup dimensions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decide whether main gets branch protection requiring the test check, so a red run actually blocks a merge instead of being advisory
- [ ] #2 Decide whether scripts/browser-verify/ runs in CI, and if so how Playwright is obtained — the scripts resolve it from the invoking directory precisely so it need not be a project dependency
- [ ] #3 Rule on the zero-dependency constraint, since it gates the above: Playwright, ESLint and web-ext lint each require devDependencies and a lockfile, which is why CI currently has no install step
- [ ] #4 Decide how to make npm run package cross-platform so CI can build and verify a store zip — overlaps TASK-6, so settle which task owns it
- [ ] #5 Accept or explicitly reject each remaining candidate: node --check, experimental test coverage, CodeQL, Dependabot, pinning actions by SHA rather than tag, and a markdown check for the no-hard-wrap rule
- [ ] #6 State what CI deliberately will not do, so the human false-positive audit is not silently assumed to be automated
<!-- AC:END -->
