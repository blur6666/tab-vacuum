/** Every tunable lives here. No logic. */

/**
 * New-tab pages across the chromium family. Compared *exactly* after
 * lowercasing and stripping query, hash and trailing slash — so near-misses
 * like `chrome://newtab-foo` or `https://example.com/newtab` do not match.
 *
 * `about:blank` is handled separately via TREAT_ABOUT_BLANK_AS_NEW_TAB.
 * The empty string (a tab with no committed URL yet) always counts.
 *
 * OBSERVED, by calling chrome.tabs.create({}) inside the extension and reading
 * back what chrome.tabs reports (2026-08-06):
 *
 *   Edge                      -> 'edge://newtab/'
 *   Brave 1.93.132            -> 'chrome://newtab/'   <- NOT 'brave://newtab/'
 *
 * Brave rewrites `brave://` for display, but the extensions API is given
 * Chromium's internal `chrome://newtab/`. So the entry that actually saves
 * Brave is `chrome://newtab`, not `brave://newtab`. The fork-specific entries
 * below are kept because they cost nothing and a future build may change its
 * mind, but only the two above are confirmed against a real browser.
 */
export const NEW_TAB_URLS = [
  'chrome://newtab',
  'chrome://new-tab-page',
  'chrome://new-tab-page-third-party',
  'chrome-search://local-ntp',
  'edge://newtab',
  'brave://newtab',
  'vivaldi://newtab',
  'opera://startpage',
  'about:newtab',
];

export const TREAT_ABOUT_BLANK_AS_NEW_TAB = true;

/**
 * Browser-internal pages that are not the new-tab page but are not real
 * browsing either — Settings, Downloads, History, Extensions, Bookmarks, and
 * whatever else ships under the browser's own scheme. Matched by scheme, not
 * by path, so a future Chromium build adding another built-in page needs no
 * update here.
 *
 * `chrome-extension:` is deliberately absent — that scheme covers every
 * installed extension's own pages, not the browser's built-in ones. Including
 * it would turn an ordinary extension's options page into a "system" tab.
 *
 * Same Brave/Edge quirk as NEW_TAB_URLS applies: the extensions API reports
 * Brave's own pages under `chrome:` regardless of what `brave://` shows in
 * the address bar, so `chrome:` is the entry that actually matches there too.
 */
export const SYSTEM_URL_SCHEMES = ['chrome:', 'edge:', 'brave:', 'vivaldi:', 'opera:'];

/**
 * A new-tab page matching any enabled rule is never a close candidate. Also
 * governs system tabs (Settings, Downloads, ...) — both are single-instance
 * offers rather than duplicate-group members, so the same protections apply.
 *
 * `active` is off deliberately. Being the front tab of a window says nothing
 * about whether a blank new-tab page is wanted — it is usually the opposite,
 * the empty tab you left showing. Closing it just reveals the tab behind it,
 * and `soleTabInWindow` still stops the case that would take a window with it.
 * NEVER_CLOSE has never included `active` either, so the two now agree.
 */
export const PROTECT = {
  pinned: true,
  active: false,
  audible: true,
  grouped: true,
  soleTabInWindow: true,
};

/**
 * Duplicates answer a different question from new-tab pages, so they get their
 * own list rather than reusing PROTECT.
 *
 * `grouped` is deliberately absent. With DEDUPE_WITHIN_TAB_GROUPS on, the
 * second copy *inside* a group is exactly what we mean to close — protecting
 * grouped tabs here would make per-group dedupe a no-op.
 *
 * `active` and `soleTabInWindow` are absent by decision: closing a duplicate
 * that is alone in its window closes that window, and the UI warns about it
 * instead of forbidding it. Set either to true to make it a hard rule.
 */
export const NEVER_CLOSE = {
  pinned: true,
  audible: true,
};

/**
 * Treat tab-group membership as part of a duplicate's identity, so the same
 * URL in two different groups keeps one copy in each. Off means one keeper
 * across the whole profile regardless of grouping.
 */
export const DEDUPE_WITHIN_TAB_GROUPS = true;

/** How long the armed "click again to close" button waits before reverting. */
export const CONFIRM_REVERT_MS = 3000;

/** Incognito tabs are only visible at all if the extension is enabled in incognito. */
export const INCLUDE_INCOGNITO = false;

/** Only these schemes take part in duplicate detection. */
export const DUPLICATE_SCHEMES = ['http:', 'https:'];

export const TRACKING_PARAM_PREFIXES = ['utm_'];

export const TRACKING_PARAMS = [
  'fbclid',
  'gclid',
  'ref',
  'ref_src',
  'mc_cid',
  'mc_eid',
  'igshid',
];

/** Conservative defaults: `www.example.com` !== `example.com`, `http` !== `https`. */
export const STRIP_WWW = false;
export const IGNORE_SCHEME = false;
