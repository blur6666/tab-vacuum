---
id: TASK-3
title: >-
  Unify Kill Em All and Vacuum em all into one button with matching maximal
  scope
status: Done
assignee: []
created_date: '2026-08-16 15:11'
updated_date: '2026-08-16 15:25'
labels: []
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Task-1 added a popup button ('Vacuum em all!') that scans and closes with broader junk rules (new tabs, extension/internal pages, error pages, auth/transactional pages) plus duplicate non-keepers, using a two-click confirm in the popup itself. The review page still has its own, older 'Kill Em All' button, which only ever reaches unused new tabs and duplicate non-keepers, and deliberately excludes system tabs (Settings, Downloads, History, etc.) per a documented design rule in CLAUDE.md and README. The two buttons currently have different names and different reach for what looks like the same kind of action, which is confusing and inconsistent. Decision from the user: both buttons should use the same single name ('Vacuum em all!') and the same maximal scope, including system tabs — i.e. the review page's button grows to match the popup's broader junk detection rather than the popup's button being narrowed to exclude system tabs. Per-category exclusion options (letting a user opt out of specific junk categories, similar to Chrome's clear-browsing-data time-range picker) are an explicit follow-up, not part of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The review page's bulk-close button and the popup's bulk-close button both read 'Vacuum em all!'
- [x] #2 Both buttons select the same closable set for the same tab set: unused new tabs, system tabs, error pages, auth/transactional pages, extension/internal pages, and duplicate non-keepers
- [x] #3 System tabs (Settings, Downloads, History, Extensions, Bookmarks, etc.) are closable by Vacuum em all! on both surfaces, protected by the same rules as other junk categories (pinned, audible, grouped, sole tab in window, extension's own page)
- [x] #4 test/execute.test.js and test/vacuum.test.js are updated so no test asserts or implies that system tabs are excluded from Vacuum em all!'s bulk selection
- [x] #5 README.md and CLAUDE.md are updated to describe one unified 'Vacuum em all!' behavior instead of two differently-scoped buttons
- [x] #6 npm test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make both surfaces share one closable-set function: switch review.js's scan from planCleanup() to planVacuum() (src/lib/vacuum.js), since execute.js's bulkSelection()/closableTabs()/protectionFor() already handle a vacuum-shaped plan's junkTabs/protectedJunkTabs generically (no execute.js changes needed).
2. Rename review.html's #kill-em-all button to #vacuum-em-all, label "Vacuum 'em all!"; merge the "System tabs" section into a new "System & other junk" section (#junk-section) covering junkType extension/internal/error/auth_or_transactional; keep "Unused new tabs" filtered to junkType new_tab.
3. Update review.js: swap element refs, render functions, select-all scope handling ('junk' replaces 'system-tabs'), and everyReportedTab() to read junkTabs/protectedJunkTabs instead of unusedNewTabs/systemTabs/protectedTabs/protectedSystemTabs.
4. Fix a real detection gap found while unifying: junk-rules.js's own new-tab/internal-page matching was narrower than url.js's isNewTabUrl/isSystemPageUrl (missed vivaldi://, opera://, chrome://new-tab-page, no pendingUrl check). Rewired detectNewTabOrExtension() to reuse those canonical predicates so Vacuum's reach is a strict superset of the plain scan's, not a divergent parallel ruleset.
5. Fix a second bug caught by re-reading callers: format.js's planToMarkdown() (Copy report) still read plan.unusedNewTabs/plan.systemTabs only, which are always empty on a planVacuum-shaped plan — the review page's Copy report would have silently omitted all junk tabs. Made it shape-agnostic by merging both sources.
6. Update tests: renamed/reframed the execute.test.js case that used to encode "system tabs excluded from Kill Em All" as a shape-dependent fact of bulkSelection(), not a permanent invariant; added a vacuum.test.js case proving a non-self system tab is swept by planVacuum + bulkSelection; added junk-rules.test.js cases for vivaldi/opera/chrome new-tab-page/pendingUrl; added a format.test.js case for the planVacuum-shaped report.
7. Updated README.md (unified intro, merged Result 2 section, new "Vacuum 'em all!" section, safety-layer wording, test count) and CLAUDE.md (Purpose paragraph, Rules 2/3/6/7) to describe the single button/behavior instead of two differently-scoped ones. Also refreshed manifest.json/package.json descriptions, stale from before task-1.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
npm test: 86/86 passing (was 84 before this task). All changes verified by running the full suite after each edit; guards.test.js re-checked explicitly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Unified the two bulk-close buttons into one 'Vacuum 'em all!' on both the popup and the review page, with identical reach on both surfaces (unused new tabs, system/internal pages, other extensions' pages, error pages, sign-in/checkout pages, duplicate non-keepers) by routing the review page's scan and its button through the same planVacuum()/bulkSelection() pair the popup already used. execute.js needed no changes — it was already shape-generic over junkTabs.

While unifying, found and fixed two real bugs the refactor would otherwise have shipped: (1) junk-rules.js's own new-tab/internal-page detection was narrower than url.js's well-tested isNewTabUrl/isSystemPageUrl (missed vivaldi://, opera://, chrome://new-tab-page, had no pendingUrl check) — rewired it to reuse those predicates so Vacuum's reach is a strict superset of the plain scan, not a second drifting ruleset; (2) format.js's planToMarkdown() (Copy report) only read plan.unusedNewTabs/plan.systemTabs, which are always empty on a planVacuum-shaped plan — the review page's Copy report would have silently dropped every junk tab. Made it shape-agnostic.

Verified with npm test: 86/86 passing (up from 84), including new/updated cases in vacuum.test.js, junk-rules.test.js, execute.test.js and format.test.js proving system tabs are now swept by Vacuum 'em all! on both surfaces. README.md and CLAUDE.md rewritten to describe the single unified button instead of two differently-scoped ones; manifest.json/package.json descriptions refreshed to match.
<!-- SECTION:FINAL_SUMMARY:END -->
