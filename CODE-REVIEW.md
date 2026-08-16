# Code review — whole repo

Reviewed at `089ca85`. All 70 tests pass. The architecture holds up: the purity boundary around `scan.js`/`url.js` is real, the single-choke-point rule for `chrome.tabs` is enforced, every DOM write goes through `textContent`, and the manifest is genuinely minimal. The findings below are ordered by severity; each one was reproduced rather than inferred, and the repro is given.

## Summary

| # | Severity | Finding |
| --- | --- | --- |
| 1 | **Blocking** | Close-time revalidation never re-checks `grouped` or `soleTabInWindow`, so a new-tab/system tab can close a window the user did not intend to close |
| 2 | **High** | Close-time revalidation never re-checks `pendingUrl`, reopening the hole `isNewTabish` exists to close |
| 3 | **High** | Kill 'Em All's confirm under-reports its count and its action reaches hand-ticked system tabs |
| 4 | **Medium** | `Close selected` is left permanently disabled after any error on the close path |
| 5 | **Medium** | `npm run package` is Windows-only and dies on Linux/macOS |
| 6 | **Medium** | The product name is inconsistent across manifest, UI and docs; the documented Playwright recipe cannot find the extension |
| 7 | **Medium** | Kill 'Em All can close whole windows without saying so in its confirm |
| 8 | **Low** | The `tabs\[` guard regex is over-broad and already distorts source |
| 9 | **Low** | The `extension page` protection is unreachable in production but tested and documented as real |
| 10 | **Low** | `normalizeUrl` drops userinfo, collapsing credentialed and anonymous URLs into one dedupe key |
| 11 | **Low** | Doc drift, duplicated constants, missing `engines`, no accessibility affordances, unguarded concurrent `load()`, `prettyUrl` drops the fragment |

---

## 1. Blocking — layer 3 does not enforce the protections that govern new-tab and system tabs

`closeTabs()` re-reads every tab before closing it, which is the layer CLAUDE.md rule 1 calls "the one that actually holds". But `staleReason()` (`src/lib/execute.js:143`) delegates its protection check to `closeBlockers()` (`src/lib/scan.js:184`), and `closeBlockers()` reads `NEVER_CLOSE` — which is only `{pinned, audible}` (`src/lib/config.js:85`).

Unused new tabs and system tabs are not governed by `NEVER_CLOSE`. They are governed by `PROTECT` via `protectionReasons()` (`src/lib/scan.js:163`), which additionally covers `grouped` and `soleTabInWindow`. Neither is ever re-checked. The scan-time protection is the only one those two rules ever get, and the whole premise of layer 3 is that scan-time state goes stale.

Reproduced — a blank new tab in a two-tab window, offered by the scan; the user then closes the other tab in that window, making the new tab the sole tab; the close still goes through:

```
A scan offers junk? [ 1 ]
A closed: 1 calls: [[1]] skipped: []
```

And the same for a tab added to a tab group after the scan:

```
B closed: 1 calls: [[1]] skipped: []
```

The first case closes a window. That is precisely the outcome `soleTabInWindow` exists to prevent, and the review page reports success with an empty `skipped` list — the user is told nothing was refused. This contradicts CLAUDE.md rule 1 and rule 4 ("Protections are honoured, always reported, and never silently skipped").

**Fix.** `closeTabs()` already calls `snapshot()`, which returns the full live tab list, so the live per-window counts are free to compute — no extra API call. Carry the tab's origin (new-tab/system versus duplicate) into the plan, then have `staleReason()` run `protectionReasons()` against the live tab and live window counts for the former, and `closeBlockers()` for the latter. `protectionReasons()` would need exporting from `scan.js`. Add tests mirroring `test/execute.test.js:181` ("a tab that became pinned or audible since the scan is skipped") for the `grouped` and `soleTabInWindow` transitions.

## 2. High — `pendingUrl` is not re-checked at close time

`isNewTabish()` (`src/lib/scan.js:155`) deliberately refuses a tab whose `pendingUrl` is real content: "A tab mid-navigation away from the new tab page is real content arriving, never a candidate." `staleReason()` compares only `tab.url` against the planned URL, so a tab that started navigating after the scan still has its old `chrome://newtab/` committed URL and passes the check.

Reproduced — the user types a URL into an offered blank tab while the review page sits open:

```
C closed: 1 calls: [[1]] skipped: []
```

The tab is destroyed mid-navigation, and what the user was navigating to is lost. This is the same class of staleness as finding 1, and it is exactly the scenario in the layer-3 rationale comment at `src/lib/execute.js:15`.

**Fix.** Add to `staleReason()`: if the live tab has a non-empty `pendingUrl` that is not a new-tab URL, skip with `'navigating since the scan'`. Reuse `isNewTabUrl` — `execute.js` already imports from `scan.js`, so the purity boundary is unaffected.

## 3. High — Kill 'Em All's label and its action disagree, and it reaches system tabs

`src/review/review.js:385`:

```js
const ids = bulkSelection(lastPlan);
if (ids.length === 0) return;
for (const id of ids) selected.add(id);
syncCheckboxes();
updateSelectionUi();
arm(killEmAll, `Kill ${ids.length}? — click again`, () => run([...selected]));
```

The prompt is built from `ids.length` — the bulk selection only — but the action fires `[...selected]`, which is the union of the bulk selection and anything the user already ticked by hand. Two consequences:

**The confirm under-reports.** Tick three system tabs, then press Kill 'Em All with five duplicates pending: the button reads `Kill 5? — click again` and eight tabs close. A confirm that names a number smaller than what it will do is worse than no number, and this is the one-click danger button.

**System tabs are reached by Kill 'Em All.** CLAUDE.md is explicit that "System tabs are deliberately outside Kill 'Em All's reach", and `bulkSelection()` honours that (`src/lib/execute.js:57`, asserted at `test/execute.test.js:84`). The guarantee is then lost in the UI layer, because the button closes `selected` rather than what `bulkSelection()` returned. The unit test passes and the invariant is still broken in the product.

**Fix.** Fire `run(ids)`, not `run([...selected])`. If the intent is genuinely "everything ticked", then the label must read `selected.size` and the CLAUDE.md/README claim about system tabs needs retracting — but the safer reading of both documents is that the button should close exactly its own selection. A regression test can cover this by extracting the handler's id computation into a testable function.

## 4. Medium — `Close selected` sticks disabled after an error

`src/review/review.js:400`:

```js
closeSelected.disabled = true;
killEmAll.disabled = true;
try { ... await load(); }
catch (error) { showError(error); }
finally { killEmAll.disabled = false; }
```

`closeSelected` is re-enabled only by `updateSelectionUi()` (`src/review/review.js:312`), which runs inside `render()`, which runs inside `load()` — all on the success path. If `closeTabs()` or `load()` throws, the button stays disabled while `selected` still holds entries, so the count reads "6 tabs selected" next to a dead button. `load()` is the likelier thrower of the two, since it makes the browser calls.

Recovery exists (Rescan re-enables it), but the state is confusing and the error message does not point at it. **Fix:** re-enable both buttons in `finally`, or call `updateSelectionUi()` there.

## 5. Medium — `npm run package` only works on Windows

`scripts/package.sh:23` uses `pwd -W` and `scripts/package.sh:25` shells out to `powershell.exe`. Under `set -euo pipefail` the first of those aborts the run on any non-Windows host:

```
$ pwd -W
/bin/bash: line 1: pwd: -W: invalid option
```

The header comment and README §"Packaging for the Chrome Web Store" both present `npm run package` as the way to build a store zip, with no platform caveat. The reasoning for avoiding `zip`/`tar` is sound for Git Bash, but the script should detect the platform and fall back to `zip -r` (or `python3 -m zipfile -c`) elsewhere, or the README should state the constraint. As written, a store build cannot be produced from CI or from any non-Windows machine.

## 6. Medium — name drift, and a Playwright recipe that cannot work

`manifest.json` and `PRIVACY.md` say **Tab Vacuum**. Everything the user actually sees says **Tab Cleanup**: `src/popup/popup.html:7` and `:12`, `src/review/review.html:7`, the error strings at `src/popup/popup.js:150` and `src/review/review.js:544`, the report heading at `src/lib/format.js:51`, and the README's own title.

This is concretely broken in one place. README.md:178 tells you to find the extension id by matching `name === 'Tab Cleanup'` in `chrome://extensions-internals/` — but the manifest name is `Tab Vacuum`, so the documented recipe finds nothing, and the README's own warning about not taking the first id in the dump makes the failure mode worse. Beyond that, a store listing whose in-product name differs from its manifest name is a routine review rejection.

**Fix:** pick one name and apply it to the manifest, both page titles, the popup `<h1>`, both permission-denied strings, the markdown report heading, and the README recipe.

## 7. Medium — Kill 'Em All can close windows without saying so

`bulkSelection()` includes non-keeper duplicates regardless of `closesWindow`. That is a documented decision — CLAUDE.md rule 5 keeps `soleTabInWindow` out of `NEVER_CLOSE` deliberately, "warned about in the UI rather than forbidden" — and per-row the warning is there (`src/review/review.js:247`).

But Kill 'Em All ticks every such row at once and confirms with a bare count. A user who presses it is told `Kill 14? — click again` with no indication that some of those fourteen take their windows with them, and the pre-ticked rows carrying `⚠ closes its window` may well be scrolled off screen. The per-row warning was designed for per-row decisions.

**Fix (small):** when the bulk selection contains any tab with `closesWindow`, extend the prompt — `Kill 14 (2 close their window)? — click again`. Keeps the documented decision, restores the disclosure at the point it matters.

## 8. Low — the `tabs\[` guard is over-broad and has already distorted the source

`test/guards.test.js:42` bans `/tabs\s*\[/` outside `chrome-tabs.js`. The intent is `chrome.tabs['remove']`, but the pattern matches any property access ending in `tabs` followed by a subscript: `group.tabs[0]`, `plan.unusedNewTabs[i]`, `plan.systemTabs[0]`, `plan.otherTabs[0]`.

The cost is already paid. `src/lib/scan.js:113` carries a five-line comment explaining that the loop destructures to `members` "rather than indexed off `bucket`" specifically to dodge this regex — a guard that changes how ordinary code is written is charging more than it is worth. Note also that `test/` is not scanned, so `test/execute.test.js:143` indexes `plan.duplicateGroups[0].tabs` freely.

CLAUDE.md already records this exact lesson for the old `.remove(` ban. **Fix:** narrow to `/\bchrome\s*\.\s*tabs\s*\[/` and `/\btabs\s*\[\s*['"\`]remove['"\`]\s*\]/`, which is what the guard is actually for. The comment at `scan.js:113` can then go.

## 9. Low — the `extension page` protection is unreachable in production

`protectionReasons()` pushes `'extension page'` when `tab.id === selfTabId` (`src/lib/scan.js:165`), but it is only ever called for tabs that already matched `isNewTabish()` or `isSystemPageUrl()`. The review page's real URL is `chrome-extension://<id>/src/review/review.html`, which matches neither — `chrome-extension:` is deliberately excluded from `SYSTEM_URL_SCHEMES` — so it falls to `normalizeUrl()`, returns `null`, and lands in `otherTabs`.

`test/scan.test.js:99` ("the review page protects itself") passes only because it hands `planCleanup` a `newTab()` as the self tab, which the real review page never is. So the test asserts a path production cannot reach, and README.md:52 documents `extension page` as a protection users will see.

No safety hole: `staleReason()` refuses `id === selfTabId` with `'this page'` (`src/lib/execute.js:145`, covered at `test/execute.test.js:213`), and `otherTabs` is unreachable anyway. But a test that green-lights an unreachable branch is a test that will not notice when the branch breaks. **Fix:** either drop the reason and the README row, or make the test use a realistic `chrome-extension://` self URL and accept that it lands in `otherTabs`.

## 10. Low — `normalizeUrl` drops userinfo

`src/lib/url.js:93` builds the key from `scheme + hostname + port + path + search`, omitting `username`/`password`:

```
D https://example.com/a === https://example.com/a
```

`https://user:pw@example.com/a` and `https://example.com/a` produce the same key, so they are offered as duplicates of each other and one is closed. These are different sessions in practice. Rare, and the flag comments show the module is intentionally conservative elsewhere (`STRIP_WWW`, `IGNORE_SCHEME` both off), which makes this omission look accidental rather than chosen. **Fix:** include userinfo in the key, or state the decision in the comment.

## 11. Low — assorted

- **Test count drift.** README.md:161 says "62 tests"; `npm test` reports 70.
- **Duplicated constant.** `src/lib/format.js:134` hardcodes `-1` where `scan.js` exports `TAB_GROUP_ID_NONE` for exactly this. `format.js` is already pure, so importing it costs nothing.
- **No `engines` field.** `test/guards.test.js:25` uses `readdirSync(..., { recursive: true })` and `entry.parentPath`, which need Node ≥ 20.12. A contributor on Node 18 gets a confusing failure in the guard tests rather than a version error. Add `"engines": { "node": ">=20.12" }`.
- **No accessibility affordances.** `grep -rn "aria-\|role=" src/` returns nothing. `#status` and `#outcome` are updated asynchronously with no `aria-live`, so "Closing…", "Closed 6 tabs" and every skip reason are silent to a screen reader — on the page whose entire job is confirming destructive actions. The icon-prefixed buttons (`↻ Rescan`, `⧉ Copy report`, `★` badges) have no text alternatives. `aria-live="polite"` on those two paragraphs is a one-line fix worth making.
- **Concurrent `load()` is unguarded.** Rapid Rescan clicks interleave two scans; whichever `render()` lands last wins, and `selected` is pruned against both plans. Harmless today because `load()` is idempotent, but a request-generation counter is cheap insurance.
- **`prettyUrl` drops the fragment** (`src/lib/format.js:33` uses `hostname + pathname + search`). Two rows on the same page with different anchors render as the same string. Consistent with `normalizeUrl` dropping anchors for dedupe, so arguably intended — but in the "Other tabs" listing, where those rows are context rather than duplicates, it makes distinct tabs indistinguishable.

## What is solid

Worth recording, since these are the parts a future change could quietly break:

- **The permission interlock** (`src/lib/scan.js:39`) throws rather than defaulting, and `test/scan.test.js:452` holds it. CLAUDE.md calls this the most dangerous path in the codebase and the code treats it that way.
- **No XSS surface.** Every user-derived string reaches the DOM through `textContent`; the only style writes take values from the hardcoded `GROUP_COLORS` map (`src/review/review.js:465`). No `innerHTML` anywhere.
- **`otherTabs` really is report-only.** `closableTabs()` and `bulkSelection()` walk only `unusedNewTabs`, `systemTabs` and `duplicateGroups`, and `test/execute.test.js:53` asserts the id-level path directly.
- **The privacy claims check out.** No network calls, no `storage`, no host permissions, no content scripts, no remote code — PRIVACY.md describes the code as written.
- **The two-click confirm** is correctly implemented as arm-then-fire with a timeout revert, and `render()` disarms everything, so a rescan cannot leave a primed danger button behind.

## Suggested order

1. Finding 1 before any release — it can close a window silently and it breaks a stated invariant.
2. Findings 2 and 3 with it; all three are the same underlying shape, a guarantee established at scan time and dropped later.
3. Finding 6 before store submission.
4. The rest at leisure.
