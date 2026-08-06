# Test plan

Most of this needs a human, but not all of it — see
[What is automated](#what-is-automated) at the bottom. Work through it in
**Brave** or **Edge**; the dry run makes every step safe.

Bring the output of step 5 back to a Claude session for heuristic tuning.

---

## Step 0 — Load the extension

```
brave://extensions   (or edge://extensions)
→ Developer mode → Load unpacked → repo root
```

Then **Details** on the card → **Permissions**. Expect exactly one entry —
`tabs`, described as *"Read your browsing history"* — and **no host
permissions**. This is the real check; loading unpacked never shows an install
dialog, so the absence of a prompt proves nothing either way.

That warning is the expected, correct behaviour, not a bug. `tabs` is what
un-redacts `url` on tab objects, and reading urls is the whole feature. See
"Permissions" in README.md for why the alternatives do not work.

---

## Step 1 — New-tab URL (already confirmed — spot-check only)

Settled on 2026-08-06 by observation, so this is no longer a blocking first step:

| Browser | Reports | Confirmed |
| --- | --- | --- |
| Edge | `edge://newtab/` | ☑ |
| Brave 1.93.132 | `chrome://newtab/` — *not* `brave://newtab/` | ☑ |

Both already match `NEW_TAB_URLS`. Re-check only if a scan reports zero unused
new tabs, since a browser update could change it. To read what the extension
actually sees, open the popup, right-click → **Inspect**, and run:

```js
(await chrome.tabs.query({ windowType: 'normal' }))
  .map(t => ({ url: t.url, pending: t.pendingUrl, title: t.title }))
```

---

## Step 2 — Constructed scenario

Build this deliberately so each protection can be checked in isolation. Use a
separate browser profile if you would rather not disturb your working windows.

| # | Set up | Expect |
| --- | --- | --- |
| 1 | 2 plain new tabs, untouched | **listed as would-close** |
| 2 | A new tab, then pin it | protected — `pinned` |
| 3 | A new tab left focused in its window | protected — `active` |
| 4 | A tab playing audio (any video), then navigate it to a new tab page | protected — `audible` |
| 5 | A new tab added to a tab group | protected — `grouped` |
| 6 | A window containing exactly one new tab | protected — `only tab in window` |
| 7 | Same URL open 3×, one with `?utm_source=x`, one with `#fragment` | **one duplicate group, ×3** |
| 8 | Two genuinely different pages on the same site | **not** grouped |

Click **Clean up my tabs**, then the **"N protected — why?"** link to expand the
reasons.

**Pass criteria:** every protection in rows 2–6 appears exactly once with the
right reason, rows 1 and 7 produce the counts above, and **nothing closes**.

---

## Step 3 — Revoked-permission interlock

`tabs` is required, so there is no prompt to test — but it can still be revoked,
and that path must fail loudly rather than quietly.

1. Details page → turn the `tabs` permission toggle **off**.
2. Open the popup and click the button. Expect the explanatory message pointing
   you back to the Details page — **not** a crash, and not an empty result that
   looks like a clean browser.
3. Open the review page too, and click Rescan. Same expectation.
4. Turn it back on and confirm both scan normally again.

The interlock being tested: without the permission `tab.url` is `undefined`
rather than `''`, which would otherwise make every tab in the browser look like
a blank new tab. `planCleanup()` throws `MissingTabsPermissionError` instead.
This is the single most dangerous failure mode in the codebase — it is the one
that would produce a "close everything" plan — so it is worth testing by hand.

---

## Step 4 — Confirm nothing was closed

Right-click the popup → **Inspect** → Console. Expect:

```
[dry-run] would close [ 12, 47, 91 ]
```

Then confirm your tab count is unchanged, and check each listed id really is
junk. `closeTabs()` returns `{ closed: 0 }` and no tab-closing call exists in
`src/` at all — but confirm it by observation, not by trusting the code.

---

## Step 5 — Real-world pass

Run it against your actual browser with your actual tab mess. This is the pass
that matters: a constructed scenario cannot surface the false positives that
real browsing produces.

**The report stays on your machine.** It lists your real URLs and tab titles, so
it is not something to paste into a chat, and nothing here asks you to. Use
**⧉ Copy report** for your own reading — the scan is a local, read-only,
dry-run pass and the output never leaves the browser.

Read it yourself and look for four things:

- Any tab under **"would close"** that you would have wanted to keep. This is
  the only truly costly error, since a false positive means a lost tab once the
  live path exists.
- Any group of identical pages that did **not** get grouped.
- Any group that should not have been grouped — different pages merged into one.
- Whether the suggested keeper (★) was the one you would have picked.

Each maps to a knob below. If you want help without sharing anything, the
symptom alone is enough — "two tabs on the same page didn't group, the URLs
differed only by a query parameter" is fully diagnosable with no URL attached.

### Tuning knobs, all in `src/lib/config.js`

| Symptom | Knob |
| --- | --- |
| New tabs not detected | `NEW_TAB_URLS` |
| Blank tabs wrongly flagged | `TREAT_ABOUT_BLANK_AS_NEW_TAB` |
| Too aggressive / not aggressive enough | `PROTECT.*` |
| `www.` vs bare host split a group | `STRIP_WWW` |
| `http` vs `https` split a group | `IGNORE_SCHEME` |
| A tracking param split a group | `TRACKING_PARAMS`, `TRACKING_PARAM_PREFIXES` |
| SPA routes wrongly merged | fragment handling in `normalizeUrl()` |

---

## What is automated

`npm test` covers everything that does not need a browser: the URL heuristics,
every protection rule, keeper selection, the permission interlock and the
dry-run guards — 36 tests over pure functions, no dependencies.

**Loading and rendering can also be scripted**, contrary to what this file used
to claim. The `--load-extension` switch was disabled in *Chrome-branded* builds
at version 137 (malware abused it) but was never removed from Chromium, so Brave
and Edge still honour it. Verified 2026-08-06 against Brave 1.93.132 and Edge on
Chromium 151: the extension registers as `location: COMMAND_LINE`, `review.html`
renders, and the scan groups real duplicate tabs correctly.

The recipe, with Playwright installed **outside** this repo so it stays
dependency-free:

```js
import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(THROWAWAY_PROFILE_DIR, {
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
  args: [
    `--disable-extensions-except=${REPO_ROOT}`,
    `--load-extension=${REPO_ROOT}`,
  ],
});
```

Find the extension id by reading `chrome://extensions-internals/` and matching on
`name === 'Tab Cleanup'` — do not just take the first id in that dump, because
Edge ships built-in extensions that appear first. Then navigate to
`chrome-extension://<id>/src/review/review.html`.

Two rules for any scripted run: use a throw-away `--user-data-dir`, never the
real profile, and never `taskkill` a browser process — close the context through
Playwright's API.

**What still needs you**, and always will:

- **Judging false positives.** Whether a flagged tab was really junk is a
  question about your intent. No script can answer it. This is step 5, and it is
  the point of the whole plan.
- **Native browser dialogs.** Anything Chromium draws outside the DOM cannot be
  clicked by Playwright. Less relevant now that `tabs` is required, but it is
  why the Details-page steps stay manual.
- **The constructed scenario in step 2**, which is faster to set up by hand than
  to script.
