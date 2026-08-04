/**
 * Pure URL predicates. Must never touch the `chrome` global — `node --test`
 * imports this file directly.
 */

import {
  NEW_TAB_URLS,
  TREAT_ABOUT_BLANK_AS_NEW_TAB,
  DUPLICATE_SCHEMES,
  TRACKING_PARAMS,
  TRACKING_PARAM_PREFIXES,
  STRIP_WWW,
  IGNORE_SCHEME,
} from './config.js';

/** Lowercase, drop query + hash, drop trailing slashes. */
function canonicalize(url) {
  let s = String(url).trim().toLowerCase();
  const queryAt = s.indexOf('?');
  const hashAt = s.indexOf('#');
  const cut = Math.min(queryAt === -1 ? s.length : queryAt, hashAt === -1 ? s.length : hashAt);
  s = s.slice(0, cut);
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

const NEW_TAB_SET = new Set(NEW_TAB_URLS.map(canonicalize));

/**
 * Is this the browser's new-tab page (or a tab with nothing committed yet)?
 *
 * `undefined` returns false rather than true: without the `tabs` permission
 * every url is undefined, and treating that as "blank new tab" would mark the
 * entire browser as junk. scan.js refuses to run in that state anyway, but the
 * predicate stays safe on its own.
 */
export function isNewTabUrl(url) {
  if (url === undefined || url === null) return false;
  const s = canonicalize(url);
  if (s === '') return true;
  if (s === 'about:blank') return TREAT_ABOUT_BLANK_AS_NEW_TAB;
  return NEW_TAB_SET.has(s);
}

function isTrackingParam(name) {
  const key = name.toLowerCase();
  return (
    TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    TRACKING_PARAMS.includes(key)
  );
}

/**
 * Canonical dedupe key, or null when the URL is unparseable or its scheme
 * does not take part in duplicate detection.
 *
 * Lowercases the scheme and host but never the path — paths are
 * case-sensitive, so `/Post` and `/post` stay distinct.
 */
export function normalizeUrl(url) {
  if (typeof url !== 'string' || url === '') return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!DUPLICATE_SCHEMES.includes(parsed.protocol)) return null;

  const scheme = IGNORE_SCHEME ? 'https:' : parsed.protocol;

  let host = parsed.hostname.toLowerCase();
  if (STRIP_WWW && host.startsWith('www.')) host = host.slice(4);

  // URL already drops default ports (443 for https, 80 for http).
  const port = parsed.port ? `:${parsed.port}` : '';

  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([aKey, aVal], [bKey, bVal]) =>
      aKey === bKey ? compare(aVal, bVal) : compare(aKey, bKey),
    );

  const search = params.length
    ? '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  return `${scheme}//${host}${port}${path}${search}`;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
