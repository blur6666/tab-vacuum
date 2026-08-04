# Manual test plan

Nothing here can be automated — see [Why this is manual](#why-this-is-manual) at
the bottom. Work through it in **Edge** or **Brave**; the dry run makes every
step safe.

Bring the output of step 5 back to a Claude session for heuristic tuning.

---

## Step 0 — Load the extension

```
edge://extensions   (or brave://extensions)
→ Developer mode → Load unpacked → repo root
```

Then **Details** on the card → **Permissions**. Expect **no required
permissions** listed. This is the real check; loading unpacked never shows an
install dialog, so the absence of a prompt proves nothing.

---

## Step 1 — Confirm the new-tab URL (do this first)

**`NEW_TAB_URLS` in `src/lib/config.js` is unverified for Edge and Brave.** It
was written from documentation, not observation. If it is wrong, the scan
silently finds zero unused new tabs and everything downstream looks broken for
the wrong reason.

1. Open a new tab (`Ctrl+T`).
2. Click in the address bar and copy what is actually there. It may be empty —
   that is fine and expected, and the scan already treats an empty URL as a new
   tab.
3. Better still, read what the extension sees. Open the extension's own popup,
   right-click → **Inspect**, and run in that console:

   ```js
   (await chrome.tabs.query({ windowType: 'normal' }))
     .map(t => ({ url: t.url, pending: t.pendingUrl, title: t.title }))
   ```

   This requires the `tabs` permission, so click **Clean up my tabs** once
   first to grant it.

**Record the exact new-tab URL string.** Expected values, none confirmed:

| Browser | Expected | Confirmed? |
| --- | --- | --- |
| Edge | `edge://newtab/` | ☐ |
| Brave | `brave://newtab/` | ☐ |

If it differs, it is a one-line addition to `NEW_TAB_URLS`. Note that Brave in
particular may report `chrome://newtab/`, since forks often keep Chromium's
internal URLs.

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

## Step 3 — Permission flow

1. Details page → revoke the `tabs` permission toggle.
2. Re-open the popup and click the button. It must **prompt**, not produce a
   plan.
3. Grant it. If the prompt closes the popup, re-open the popup — it should land
   already-granted and scan immediately. **Note whether this happens**, since it
   is browser-specific and the popup carries a hint about it.
4. Deny it once, too. Expect the explanatory message, not a crash and not an
   empty result that looks like success.

The interlock being tested: without the permission `tab.url` is `undefined`
rather than `''`, which would otherwise make every tab in the browser look like
a blank new tab. `planCleanup()` throws `MissingTabsPermissionError` instead.

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

## Step 5 — Real-world pass, and what to bring back

Run it against your actual browser with your actual tab mess. This is the pass
that matters: a constructed scenario cannot surface the false positives that
real browsing produces.

Click **⧉ Copy report** and paste the markdown into a Claude session, along with:

- The new-tab URL from step 1, and whether `NEW_TAB_URLS` needed changing.
- Any tab under **"would close"** that you would have wanted to keep — the most
  valuable signal here, since a false positive is the only truly costly error.
- Any duplicate group that should not have been grouped, or pair that should
  have been and was not.
- Whether the suggested keeper (★) was the one you would have picked.

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

## Why this is manual

Chromium removed the `--load-extension` command-line switch in version 137
because malware used it to sideload extensions silently. Verified against
Chrome 150 on Windows: the switch is accepted but ignored in both headful and
`--headless=new` mode, and the extension never appears in the profile's
extension settings. There is no scripted path to install an unpacked extension,
so an agent cannot drive this test suite for you.

What *is* automated is everything that does not need a browser: `npm test`
covers the URL heuristics, every protection rule, keeper selection, the
permission interlock, and the dry-run guards — 36 tests over pure functions.
The browser passes exist to check the assumptions those tests are built on.
