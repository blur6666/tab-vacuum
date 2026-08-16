---
id: TASK-9
title: Clear the low-severity findings from CODE-REVIEW.md
status: To Do
assignee: []
created_date: '2026-08-16 19:53'
labels: []
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tail of CODE-REVIEW.md, findings 8 to 11. Small, independent, safe to batch into one PR. (8) The close-path guard in test/guards.test.js bans /tabs\s*\[/ outside chrome-tabs.js, which matches any property access ending in 'tabs' followed by a subscript — group.tabs[0], plan.systemTabs[0]. The cost is already paid: src/lib/scan.js carries a five-line comment explaining that a loop destructures to 'members' purely to dodge the regex. Narrow it to what it is actually for (chrome.tabs[...] and tabs['remove']) and delete that comment. (9) The 'extension page' protection in protectionReasons() is unreachable in production: it only runs for tabs that already matched isNewTabish() or isSystemPageUrl(), and the review page is a chrome-extension:// URL which matches neither. test/scan.test.js passes only because it hands planCleanup a new-tab URL as the self tab. Either drop the reason and its README row, or make the test realistic and accept that the page lands in otherTabs. The real self-protection is staleReason()'s 'this page' check, which is genuine and tested. (10) normalizeUrl() omits username and password, so https://user:pw@example.com/a and https://example.com/a share a dedupe key and one gets closed. Include userinfo or record the decision in the comment. (11) Doc and consistency drift: README says '62 tests' when there are 84; src/lib/format.js hardcodes -1 where scan.js exports TAB_GROUP_ID_NONE; package.json has no engines field although the guard tests need Node >= 20.12 for Dirent.parentPath and import.meta.dirname; nothing in src/ has any aria attributes, so #status and #outcome update silently for screen readers on the page whose whole job is confirming destructive actions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The guards regex no longer matches ordinary .tabs[i] indexing, and the workaround comment in scan.js is gone
- [ ] #2 The 'extension page' protection is either removed with its README row, or its test reflects a real chrome-extension:// review page
- [ ] #3 normalizeUrl either includes userinfo or documents why it does not
- [ ] #4 README's test count is accurate, format.js imports TAB_GROUP_ID_NONE, and package.json declares engines node >= 20.12
- [ ] #5 #status and #outcome on the review page carry aria-live=polite
- [ ] #6 npm test passes
<!-- AC:END -->
