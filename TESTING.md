# Test plan

Work through it in **Brave**. The dry run makes every step safe.

Loading and rendering can be scripted — see [What is automated](#what-is-automated). Steps 2 and 5 are the ones that genuinely need a human, because they are judgements about your own tabs.

---

## Step 0 — Load the extension

```
brave://extensions → Developer mode → Load unpacked → repo root
```

Then **Details** on the card → **Permissions**. Expect exactly one entry, `tabs`, and **no host permissions**. Loading unpacked never shows an install dialog, so this page is the only real check.

The *"Read your browsing history"* wording is expected and correct, not a bug — see "Permissions" in README.md.

---

## Step 1 — New-tab URL (settled; spot-check only)

Already confirmed by observation: Edge reports `edge://newtab/`, Brave reports `chrome://newtab/`. Both already match `NEW_TAB_URLS`.

Re-check only if a scan reports **zero** unused new tabs, since a browser update could change it. To read what the extension sees, open the popup, right-click → **Inspect**, and run:

```js
(await chrome.tabs.query({ windowType: 'normal' }))
  .map(t => ({ url: t.url, pending: t.pendingUrl, title: t.title }))
```

---

## Step 2 — Constructed scenario

Build this deliberately so each protection can be checked in isolation. Use a eseparate browser profile if you would rather not disturb your working windows.

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

Click **Clean up my tabs**, then the **"N protected — why?"** link to expand the reasons.

**Pass criteria:** every protection in rows 2–6 appears exactly once with the right reason, rows 1 and 7 produce the counts above, and **nothing closes**.

---

## Step 3 — Revoked-permission interlock

`tabs` is required, so there is no prompt to test — but it can still be revoked, and that path must fail loudly rather than quietly.

1. Details page → turn the `tabs` toggle **off**.
2. Open the popup and click the button. Expect the explanatory message pointing back to the Details page — **not** a crash, and not an empty result that looks like a clean browser.
3. Same for the review page and its Rescan button.
4. Turn it back on; both must scan normally again.

This is the most dangerous failure mode in the codebase: without the permission `tab.url` is `undefined` rather than `''`, which would make every tab look like a blank new tab and turn the plan into "close everything". Worth testing by hand.

---

## Step 4 — Confirm nothing was closed

Right-click the popup → **Inspect** → Console. Expect:

```
[dry-run] would close [ 12, 47, 91 ]
```

Confirm your tab count is unchanged. Verify by observation, not by trusting the code.

---

## Step 5 — Real-world pass

Run it against your actual browser with your actual tab mess. This is the pass that matters: a constructed scenario cannot surface the false positives that real browsing produces.

**The report stays on your machine.** It lists your real URLs and tab titles, so it is not something to paste into a chat, and nothing here asks you to. Use **⧉ Copy report** for your own reading.

Read it yourself and look for four things:

- Any tab under **"would close"** that you would have wanted to keep. This is the only truly costly error, since a false positive means a lost tab once the live path exists.
- Any group of identical pages that did **not** get grouped.
- Any group that should not have been grouped — different pages merged into one.
- Whether the suggested keeper (★) was the one you would have picked.

Each maps to a knob below. If you want help without sharing anything, the symptom alone is enough — "two tabs on the same page didn't group, the URLs differed only by a query parameter" is fully diagnosable with no URL attached.

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

`npm test` covers everything that does not need a browser: URL heuristics, every protection rule, keeper selection, the permission interlock and the dry-run guards — 36 tests over pure functions.

Loading and rendering can also be scripted, because Brave and Edge still honour\ `--load-extension` (CLAUDE.md explains why Chrome does not). Install Playwright\] s**outside this repo** so the project stays dependency-free:

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

Two gotchas that cost real time:

- **Find the extension id by name.** Read `chrome://extensions-internals/` and match on `name === 'Tab Cleanup'`. Do not take the first id in that dump — Edge ships built-in extensions that appear first, and you will end up navigating to a page that does not exist.
- **Pass `viewport: null`.** Otherwise Playwright pins a 1280×720 viewport and silently ignores `--window-size`.

Two rules for any scripted run: a throw-away `--user-data-dir`, never the real profile, and never `taskkill` a browser process — close the context through Playwright's API.
