# Tab Vacuum — project rules

## Purpose

Personal MV3 extension. When you press "Scan my tabs" it scans every tab of every normal window in the profile you are using, and reports three things: unused new-tab pages, system tabs (Settings, Downloads, History, Extensions, and similar built-in pages, matched by `SYSTEM_URL_SCHEMES` in `src/lib/config.js`), and duplicate-URL groups. Once results are showing, that button reads "Scan again" — it re-scans in place and never navigates; "Review & clean →" is the only thing that opens the report.

Acting happens in two places. On the review page you go through the results one by one and tick what you want gone, use the System tabs section's own **select all** plus **Close selected**, or click **Kill 'Em All!** to take every duplicate except one copy per group, plus the unused new tabs. System tabs are deliberately outside Kill 'Em All's reach — Settings or Downloads sitting open is usually intentional, unlike a stray blank tab, so it gets its own opt-in rather than riding along with the one-click danger button.

The second is **Vacuum 'em all!** in the popup, which takes unused new tabs, system tabs *and* duplicate non-keepers in one armed-then-confirmed press — Kill 'Em All plus system tabs, without opening the report. It reaches system tabs where Kill 'Em All does not, and the compensation is that its confirm lists every tab it will close: on the review page a system tab is one visible row you tick yourself, so the equivalent here is seeing the list before confirming rather than a bare count. What it may take is a *selection over an ordinary scan*, never a second set of rules — `planVacuum()` in `src/lib/vacuum.js` filters `planCleanup()`'s output and nothing else, so every protection is the one the review page shows.

**A rule that closes a tab has to be decidable from its URL.** Page titles and path guesses are not evidence: `/\b404\b/` against a title closes an article about a 404, and `/checkout/complete` closes the order confirmation. Both shipped once, in a `junk-rules.js` that no longer exists — see the commit that removed it. Detecting a real error page needs the response status, which needs host permissions this extension does not take, so it is not a heuristic to sharpen but a feature to decline.

## Rules

1. **Nothing closes without a visible selection and a second click.** There is no dry-run flag any more — the safety is at runtime, in three layers: protections computed by `scan.js`, the two-click arm-then-fire confirm in the UI, and `closeTabs()` in `src/lib/execute.js` re-reading every tab immediately before closing it. *Why:* a review page can sit open for an hour while tabs navigate, get pinned, or start playing audio underneath it. Layer 3 is the one that actually holds.

2. **The popup closes tabs from exactly one control, and that control shows its work.** "Scan my tabs" still only ever reports — scanning must never be one click away from deleting something. **Vacuum 'em all!** is the single exception, added deliberately: it arms on the first click and closes on the second, and the armed state lists the tabs it will take, not just how many. *Why:* the original rule was that the popup never acts at all, because the review page can show a row per tab and the popup cannot. A one-click bulk close that names its targets keeps what that rule was protecting — you see what goes before it goes — while a count alone does not, which is why the listing is part of the rule and not a nicety.

3. **Duplicates are deduplicated per tab group, and one copy always survives.** The same URL in "Work" and in "Research" is two groups, each keeping its own ★. Kill 'Em All only ever selects non-keepers, so it cannot empty a group however the protections fall. *Why:* copies in different groups are usually a deliberate choice, not a mistake. Ticking a ★ by hand is still allowed — that is a one-by-one decision, not a bulk one.

4. **Protections are honoured, always reported, and never silently skipped.** Protected tabs appear in the results with a ⚠ and their reason, with a disabled checkbox, and no bulk action can reach them. *Why:* a silently applied rule can't be verified or tuned.

5. **Two protection sets, because they answer different questions.** `PROTECT` decides whether a new-tab page is a candidate at all. `NEVER_CLOSE` decides whether a duplicate may be closed, and is deliberately shorter — `grouped` is absent because protecting grouped tabs would make per-group dedupe a no-op, and `soleTabInWindow` is absent by decision, warned about in the UI rather than forbidden. Closing a duplicate that is alone in its window closes that window; the row says so.

   **`active` is off in both.** It was a `PROTECT` rule until it was removed as not earning its keep: a blank new-tab page at the front of a window is the tab you want gone, not evidence you want it. Closing it reveals the tab behind it, and `soleTabInWindow` still covers the one case with a real consequence. The flag stays in `PROTECT` set to `false` rather than being deleted, so turning it back on is one word.

6. **The report shows every tab; the filter decides how many you look at.** `planCleanup()` returns `otherTabs` alongside the actionable lists — every considered tab that is neither an unused new tab nor part of a duplicate group, each with a `reason` and `closable: false`. The review page's **Only tabs up for deletion** checkbox is on at load and hides that section. *Why:* seeing the whole profile is how you confirm the scan did not miss something, but the default view has to stay the short one — a page listing 300 rows is a page nobody reads before clicking.

7. **`otherTabs` is report, never offer.** `closableTabs()` and `bulkSelection()` in `execute.js` walk only `unusedNewTabs` and `duplicateGroups`, so nothing in `otherTabs` can be ticked, bulk-selected, or closed by id. *Why:* widening what is *displayed* must never widen what is *reachable*. `test/execute.test.js` asserts this directly.

We still do not inspect the "back stack" — the history a tab would return to on Back. There may be something important there.

## Committing — mandatory

**Every task ends with a commit. One commit per task, always.** Finishing a task means the work is committed, not merely written to disk — an uncommitted change is not a finished task. Do not batch several tasks into one commit, and do not leave a finished task sitting in the working tree waiting for the next one.

When a run covers several tasks, that is several commits, each holding one task's code, tests and docs together and each passing `npm test` on its own. Push when the run is done.

*Why:* one task per commit is what makes a change reviewable, revertable and bisectable. A commit spanning three tasks cannot be undone without taking the other two with it, and the reason for any given line is lost in the mixture.

## Writing style for `.md` files

**Do not hard-wrap Markdown at 80 characters.** A paragraph is one line, however long it runs — no manual line breaks inside it. Break lines only where the document genuinely breaks: between paragraphs, list items, table rows and headings. *Why:* re-wrapped paragraphs turn a one-word edit into a diff across every line of the paragraph, and editors soft-wrap for reading anyway. This applies to CLAUDE.md, README.md, BACKLOG.md and any other Markdown in the repo. Source code keeps its own line length; this rule is about prose only.

## Architecture constraints

- `src/lib/url.js` and `src/lib/scan.js` never touch the `chrome` global — pure functions, so `node --test` imports them with no browser and no mock.
- `src/lib/chrome-tabs.js` is the only file that may call `chrome.tabs` or `chrome.tabGroups` — one auditable choke point, enforced by `test/guards.test.js`.
- `src/lib/execute.js` decides *whether* a tab may close; `chrome-tabs.js` performs it. `closeTabs()` takes `closer` and `snapshot` as injected options so the policy is testable with no browser — `test/execute.test.js` passes fakes.
- No service worker, no shared state: the review page re-runs the scan on load instead of receiving a snapshot. Nothing to go stale.
- No build step, no runtime dependencies, no framework.

## Lessons learned

- **`tabs` is the permission ceiling.** `manifest.json` declares `"permissions": ["tabs"]` and nothing else. No `storage`, host permissions, `<all_urls>` or `content_scripts` without an explicit decision.
- **`tabGroups` was that explicit decision, and it is optional.** It carries its own warning — *"View and manage your tab groups"* — and buys only cosmetics: a heading reading "Work" in the group's colour instead of "group 1". Per-group deduplication reads `tab.groupId`, which is available on every `Tab` with no permission at all. Declining costs labels and nothing else. `chrome.tabGroups.query({})` returns `{id, title, color, collapsed, windowId}`.
- **Without `tabs`, `tab.url` is `undefined`, not `''`.** Unguarded, every tab looks like a blank new tab and the plan becomes "close everything". `planCleanup()` throws `MissingTabsPermissionError` — never soften that into a default or an empty result. Most dangerous path in the codebase.
- **`chrome.permissions.request()` throws for non-optional permissions.** `tabs` is required, so `src/lib/permissions.js` calls `contains()` instead. `tabGroups` *is* optional, so `requestTabGroupsPermission()` is the real call — and `review.js` has it as the **first statement of the click handler with no `await` before it**. An intervening await consumes the user gesture and the request fails.
- **The close guard bans specific patterns, not `.remove(`.** `test/guards.test.js` matches `tabs.remove`, `tabs[...]`, `chrome['tabs'].remove`, and destructured `remove` — everywhere except `chrome-tabs.js`. Do not re-add a blanket `.remove(` ban — it forbade `element.remove()` across the whole UI and still missed `chrome.tabs['remove']()`. The companion guard on `chrome.tabs` strips comments before matching, for the same reason: `config.js` and `scan.js` discuss these APIs in prose constantly. `execute.js` is the real guarantee; the regexes are a backstop.
- **Chromium exposes no per-tab navigation history.** "Never used" is a URL heuristic — a tab navigated *back* to a new-tab page is indistinguishable from a fresh one. `lastAccessed` is context, never a filter.

## Browser quirks

- **Brave hands the extensions API `chrome://newtab/`**, not the `brave://newtab/` its address bar shows. Edge reports `edge://newtab/`. `NEW_TAB_URLS` must carry the `chrome://` form or Brave never matches.
- **`--load-extension` is disabled only on Chrome-branded builds (137+).** It works on Brave, Edge, and Playwright's bundled Chromium, headless included, so browser testing is partly automatable — recipe in README.md. Automation still can't judge whether a flagged tab was junk, so the false-positive audit stays human.
- **The confirm is two clicks on one button, never `confirm()`.** A native dialog blocks every extension event until dismissed and cannot be driven from an automated run. Same reason there is no `alert()` anywhere.

## Not God's mandaments but be careful:

- **No `--remote-debugging-port`.** Unauthenticated; any local process can drive it. Playwright talks over a pipe instead.
- **Never `taskkill` a browser process.** It kills the user's real windows and real tabs. Close the Playwright context through its API.
- **Never point an automated run at the real profile.** Always a throw-away `--user-data-dir`.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
