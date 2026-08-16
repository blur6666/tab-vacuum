/**
 * Shared Junk Detection Rules
 * Pure functions for local, deterministic classification of low-value and operational tabs.
 */

import { isNewTabUrl, isSystemPageUrl } from './url.js';

export const JUNK_TYPES = {
  NEW_TAB: 'new_tab',
  EXTENSION: 'extension',
  INTERNAL: 'internal',
  ERROR: 'error',
  AUTH_OR_TRANSACTIONAL: 'auth_or_transactional',
};

/**
 * Tests whether a URL matches any rule in the privacy blocklist.
 * Supports exact domain (bank.com), wildcard (*.bank.com), full URL prefix, and file:// scheme.
 * @param {string} url
 * @param {string[] | string} blocklist
 * @returns {boolean}
 */
export function isBlockedByPrivacy(url, blocklist = []) {
  if (!url) return false;
  const rawList = Array.isArray(blocklist)
    ? blocklist
    : (typeof blocklist === 'string' ? blocklist.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) : []);

  if (rawList.length === 0) return false;

  const lowerUrl = url.toLowerCase();
  let domain = '';
  try {
    domain = new URL(url).hostname.toLowerCase();
  } catch {}

  for (const rawRule of rawList) {
    const rule = rawRule.trim().toLowerCase();
    if (!rule) continue;

    // file:// check
    if (rule === 'file://' || rule === 'file' || rule === 'file://*') {
      if (lowerUrl.startsWith('file://')) return true;
    }

    // Wildcard prefix e.g. *.internal.com
    if (rule.startsWith('*.')) {
      const baseDomain = rule.slice(2);
      if (domain === baseDomain || domain.endsWith('.' + baseDomain)) return true;
    }

    // Exact domain or subdomain match
    if (domain && (domain === rule || domain.endsWith('.' + rule))) {
      return true;
    }

    // URL prefix match: only for rules that look like scheme+host or contain a path
    // separator. Bare tokens ('test', 'http') must not block unrelated URLs.
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(rule) || rule.includes('/')) {
      if (lowerUrl.startsWith(rule)) {
        return true;
      }
    }
  }

  return false;
}

// Checks if a URL is scriptable by content scripts
export function isScriptableUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('file:///')) &&
    !lower.startsWith('chrome://') &&
    !lower.startsWith('chrome-extension://') &&
    !lower.startsWith('edge://') &&
    !lower.startsWith('about:') &&
    !lower.startsWith('devtools://') &&
    !lower.startsWith('view-source:') &&
    !lower.startsWith('https://chromewebstore.google.com') &&
    !lower.startsWith('https://chrome.google.com/webstore')
  );
}

/**
 * Rule 1: New tab, extension, devtools, or internal settings pages.
 * @param {{ url?: string, title?: string }} tab
 * @returns {'new_tab' | 'extension' | 'internal' | null}
 */
export function detectNewTabOrExtension(tab) {
  const rawUrl = tab?.url ?? '';
  const url = rawUrl.toLowerCase();
  const title = (tab?.title || '').toLowerCase();

  // isNewTabUrl is the same predicate scan.js uses — it already covers every
  // Chromium-family new-tab variant (config.js: NEW_TAB_URLS), including the
  // Brave/Edge quirks, plus an uncommitted tab's empty url. The pendingUrl
  // check mirrors scan.js's isNewTabish: a tab mid-navigation away from the
  // new-tab page is real content arriving, never a candidate.
  const pendingUrl = tab?.pendingUrl;
  const committedIsNewTab = isNewTabUrl(rawUrl) || title === 'new tab';
  const pendingIsNewTab = pendingUrl === undefined || pendingUrl === '' || isNewTabUrl(pendingUrl);
  if (committedIsNewTab && pendingIsNewTab) {
    return 'new_tab';
  }

  if (url.startsWith('chrome-extension://') || url.startsWith('edge-extension://') || url.startsWith('moz-extension://')) {
    return 'extension';
  }

  // isSystemPageUrl matches the same SYSTEM_URL_SCHEMES scan.js uses (chrome,
  // edge, brave, vivaldi, opera). about:/devtools://view-source: are added on
  // top — scan.js has no equivalent for those since they are not http/https
  // and never entered duplicate detection either.
  if (
    isSystemPageUrl(rawUrl) ||
    url.startsWith('about:') ||
    url.startsWith('devtools://') ||
    url.startsWith('view-source:')
  ) {
    return 'internal';
  }

  return null;
}

/**
 * Rule 2: Error pages (404, 500, connection lost).
 * @param {{ url?: string, title?: string }} tab
 * @returns {'error' | null}
 */
export function detectErrorPage(tab) {
  const title = (tab?.title || '').toLowerCase();
  if (!title) return null;

  const errorPatterns = [
    /\b404\b/i,
    /\b500\b/i,
    /not found/i,
    /page not found/i,
    /this site can't be reached/i,
    /problem loading page/i,
    /server error/i,
    /access denied/i,
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(title)) {
      return 'error';
    }
  }

  return null;
}

/**
 * Rule 3: Auth, login, signup, password reset, or post-action thank-you pages.
 * @param {{ url?: string, title?: string }} tab
 * @returns {'auth_or_transactional' | null}
 */
export function detectAuthOrTransactional(tab) {
  const rawUrl = tab?.url || '';
  if (!rawUrl) return null;

  let pathname = '';
  try {
    const parsed = new URL(rawUrl);
    pathname = parsed.pathname.toLowerCase();
  } catch {
    pathname = rawUrl.toLowerCase();
  }

  const authPatterns = [
    /\/(login|signin|sign-in|log-in)(\/|$)/i,
    /\/oauth(\/|$)/i,
    /\/(reset-password|forgot-password|forgot)(\/|$)/i,
    /\/(verify|confirm|confirmation)(\/|$)/i,
    /\/(thank-you|thankyou|obrigado|success|checkout\/complete)(\/|$)/i,
  ];

  for (const pattern of authPatterns) {
    if (pattern.test(pathname)) {
      return 'auth_or_transactional';
    }
  }

  return null;
}

/**
 * Master junk classifier running all pure rules sequentially.
 * @param {{ url?: string, title?: string }} tab
 * @returns {string | null}
 */
export function detectJunk(tab) {
  return (
    detectNewTabOrExtension(tab) ||
    detectErrorPage(tab) ||
    detectAuthOrTransactional(tab) ||
    null
  );
}
