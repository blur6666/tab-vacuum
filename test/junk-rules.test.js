import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectNewTabOrExtension,
  detectErrorPage,
  detectAuthOrTransactional,
  detectJunk,
  isBlockedByPrivacy,
  isScriptableUrl,
  JUNK_TYPES,
} from '../src/lib/junk-rules.js';

test('detectNewTabOrExtension identifies blank/new tabs, extensions, and internal pages', () => {
  assert.equal(detectNewTabOrExtension({ url: 'about:blank' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectNewTabOrExtension({ url: 'chrome://newtab/' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectNewTabOrExtension({ url: 'edge://newtab' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectNewTabOrExtension({ title: 'New Tab' }), JUNK_TYPES.NEW_TAB);

  assert.equal(
    detectNewTabOrExtension({ url: 'chrome-extension://abcdef/popup.html' }),
    JUNK_TYPES.EXTENSION,
  );
  assert.equal(
    detectNewTabOrExtension({ url: 'edge-extension://abcdef/popup.html' }),
    JUNK_TYPES.EXTENSION,
  );
  assert.equal(
    detectNewTabOrExtension({ url: 'moz-extension://abcdef/popup.html' }),
    JUNK_TYPES.EXTENSION,
  );

  assert.equal(detectNewTabOrExtension({ url: 'chrome://settings/' }), JUNK_TYPES.INTERNAL);
  assert.equal(detectNewTabOrExtension({ url: 'edge://flags' }), JUNK_TYPES.INTERNAL);
  assert.equal(detectNewTabOrExtension({ url: 'about:config' }), JUNK_TYPES.INTERNAL);
  assert.equal(detectNewTabOrExtension({ url: 'devtools://devtools/bundled/...' }), JUNK_TYPES.INTERNAL);
  assert.equal(detectNewTabOrExtension({ url: 'view-source:https://example.com' }), JUNK_TYPES.INTERNAL);

  assert.equal(detectNewTabOrExtension({ url: 'https://example.com', title: 'Example' }), null);

  // Reuses the same predicates as scan.js (isNewTabUrl / isSystemPageUrl), so
  // it must not be narrower than the plain "Scan my tabs" detection.
  assert.equal(detectNewTabOrExtension({ url: 'vivaldi://newtab/' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectNewTabOrExtension({ url: 'opera://startpage/' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectNewTabOrExtension({ url: 'chrome://new-tab-page/' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectNewTabOrExtension({ url: '' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectNewTabOrExtension({ url: 'vivaldi://settings/' }), JUNK_TYPES.INTERNAL);
  assert.equal(detectNewTabOrExtension({ url: 'opera://settings/' }), JUNK_TYPES.INTERNAL);

  // A tab mid-navigation away from the new-tab page is real content arriving,
  // not new_tab — same rule as scan.js's isNewTabish. It still falls through
  // to 'internal', because isSystemPageUrl matches on scheme alone — the same
  // thing scan.js's isSystemPageUrl(tab.url) does once isNewTabish is false.
  assert.equal(
    detectNewTabOrExtension({ url: 'chrome://newtab/', pendingUrl: 'https://example.com' }),
    JUNK_TYPES.INTERNAL,
  );
});

test('detectErrorPage matches error indicators in page titles', () => {
  assert.equal(detectErrorPage({ title: '404 Not Found' }), JUNK_TYPES.ERROR);
  assert.equal(detectErrorPage({ title: 'HTTP Error 500' }), JUNK_TYPES.ERROR);
  assert.equal(detectErrorPage({ title: 'Page Not Found - MySite' }), JUNK_TYPES.ERROR);
  assert.equal(detectErrorPage({ title: "This site can't be reached" }), JUNK_TYPES.ERROR);
  assert.equal(detectErrorPage({ title: 'Problem loading page' }), JUNK_TYPES.ERROR);
  assert.equal(detectErrorPage({ title: 'Internal Server Error' }), JUNK_TYPES.ERROR);
  assert.equal(detectErrorPage({ title: 'Access Denied (403)' }), JUNK_TYPES.ERROR);

  assert.equal(detectErrorPage({ title: 'Normal Page Title' }), null);
  assert.equal(detectErrorPage({ title: '' }), null);
  assert.equal(detectErrorPage({}), null);
});

test('detectAuthOrTransactional matches login, auth, reset, and post-action urls', () => {
  assert.equal(
    detectAuthOrTransactional({ url: 'https://example.com/login' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://example.com/sign-in/' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://auth.example.com/oauth/authorize?client_id=1' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://example.com/reset-password' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://example.com/forgot' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://example.com/verify' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://example.com/confirmation' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://shop.com/checkout/complete' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://store.com/thank-you' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(
    detectAuthOrTransactional({ url: 'https://store.com/obrigado' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );

  assert.equal(detectAuthOrTransactional({ url: 'https://example.com/dashboard' }), null);
  assert.equal(detectAuthOrTransactional({ url: 'https://example.com/blog/how-to-login' }), null);
  assert.equal(detectAuthOrTransactional({}), null);
});

test('detectJunk sequentially tests rules', () => {
  assert.equal(detectJunk({ url: 'about:blank' }), JUNK_TYPES.NEW_TAB);
  assert.equal(detectJunk({ url: 'https://example.com', title: '404 Not Found' }), JUNK_TYPES.ERROR);
  assert.equal(
    detectJunk({ url: 'https://example.com/login', title: 'Sign In' }),
    JUNK_TYPES.AUTH_OR_TRANSACTIONAL,
  );
  assert.equal(detectJunk({ url: 'https://example.com/docs', title: 'Documentation' }), null);
});

test('isBlockedByPrivacy matches exact domain, wildcards, prefixes, and file scheme', () => {
  const blocklist = ['bank.com', '*.internal.net', 'file://', 'https://secure.corp/'];

  assert.equal(isBlockedByPrivacy('https://bank.com/account', blocklist), true);
  assert.equal(isBlockedByPrivacy('https://sub.bank.com/page', blocklist), true);
  assert.equal(isBlockedByPrivacy('https://app.internal.net/dash', blocklist), true);
  assert.equal(isBlockedByPrivacy('file:///C:/Users/test/file.txt', blocklist), true);
  assert.equal(isBlockedByPrivacy('https://secure.corp/admin', blocklist), true);

  assert.equal(isBlockedByPrivacy('https://otherbank.com', blocklist), false);
  assert.equal(isBlockedByPrivacy('https://external.net', blocklist), false);
  assert.equal(isBlockedByPrivacy('https://example.com', []), false);
  assert.equal(isBlockedByPrivacy('', blocklist), false);
});

test('isScriptableUrl recognizes standard web pages and filters restricted schemes', () => {
  assert.equal(isScriptableUrl('https://example.com'), true);
  assert.equal(isScriptableUrl('http://localhost:3000'), true);
  assert.equal(isScriptableUrl('file:///path/to/page.html'), true);

  assert.equal(isScriptableUrl('chrome://extensions'), false);
  assert.equal(isScriptableUrl('chrome-extension://abcdef/page.html'), false);
  assert.equal(isScriptableUrl('edge://settings'), false);
  assert.equal(isScriptableUrl('about:blank'), false);
  assert.equal(isScriptableUrl('devtools://devtools/...'), false);
  assert.equal(isScriptableUrl('https://chromewebstore.google.com/detail/...'), false);
  assert.equal(isScriptableUrl('https://chrome.google.com/webstore/detail/...'), false);
});
