/**
 * Every tunable lives here. No logic.
 *
 * See CLAUDE.md rule 1: DRY_RUN is a constant on purpose. There is no UI
 * toggle and no storage-backed setting, so nothing a user clicks can turn
 * real tab closing on.
 */

export const DRY_RUN = true;

/**
 * New-tab pages across the chromium family. Compared *exactly* after
 * lowercasing and stripping query, hash and trailing slash — so near-misses
 * like `chrome://newtab-foo` or `https://example.com/newtab` do not match.
 *
 * `about:blank` is handled separately via TREAT_ABOUT_BLANK_AS_NEW_TAB.
 * The empty string (a tab with no committed URL yet) always counts.
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

/** A new-tab page matching any enabled rule is never a close candidate. */
export const PROTECT = {
  pinned: true,
  active: true,
  audible: true,
  grouped: true,
  soleTabInWindow: true,
};

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
