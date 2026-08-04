import test from 'node:test';
import assert from 'node:assert/strict';

import { isNewTabUrl, normalizeUrl } from '../src/lib/url.js';

test('isNewTabUrl matches new-tab pages across the chromium family', () => {
  const newTabUrls = [
    'chrome://newtab/',
    'chrome://newtab',
    'CHROME://NEWTAB/',
    'chrome://new-tab-page/',
    'chrome://new-tab-page-third-party/',
    'chrome-search://local-ntp/',
    'edge://newtab/',
    'brave://newtab/',
    'vivaldi://newtab/',
    'opera://startpage/',
    'about:newtab',
    'about:blank',
    '',
  ];

  for (const url of newTabUrls) {
    assert.equal(isNewTabUrl(url), true, `expected ${JSON.stringify(url)} to be a new tab`);
  }
});

test('isNewTabUrl ignores query and hash on the new-tab page', () => {
  assert.equal(isNewTabUrl('chrome://new-tab-page/?foo=1'), true);
  assert.equal(isNewTabUrl('chrome://newtab/#section'), true);
});

test('isNewTabUrl rejects near-misses', () => {
  const notNewTabs = [
    'chrome://newtab-foo/',
    'chrome://newtabs/',
    'chrome://settings/',
    'chrome://history/',
    'https://example.com/newtab',
    'https://newtab.example.com/',
    'https://example.com/',
    'about:blankish',
    'file:///C:/tmp/index.html',
  ];

  for (const url of notNewTabs) {
    assert.equal(isNewTabUrl(url), false, `expected ${url} not to be a new tab`);
  }
});

test('isNewTabUrl treats a redacted url as not-a-new-tab', () => {
  // Without the `tabs` permission url is undefined. Returning true here would
  // mark the entire browser as junk.
  assert.equal(isNewTabUrl(undefined), false);
  assert.equal(isNewTabUrl(null), false);
});

test('normalizeUrl collapses the noise that creates false distinctions', () => {
  const key = normalizeUrl('https://example.com/post');
  const equivalent = [
    'https://example.com/post/',
    'https://example.com/post#comments',
    'https://example.com/post?utm_source=newsletter',
    'https://example.com/post?utm_source=x&utm_medium=y&utm_campaign=z',
    'https://example.com/post?fbclid=abc',
    'https://example.com/post?gclid=abc',
    'https://example.com/post?ref=hn',
    'https://EXAMPLE.com/post',
    'https://example.com:443/post',
  ];

  for (const url of equivalent) {
    assert.equal(normalizeUrl(url), key, `expected ${url} to normalize to ${key}`);
  }
});

test('normalizeUrl is order-insensitive for real query params', () => {
  assert.equal(
    normalizeUrl('https://example.com/search?a=1&b=2'),
    normalizeUrl('https://example.com/search?b=2&a=1'),
  );
});

test('normalizeUrl keeps genuinely different URLs apart', () => {
  const key = normalizeUrl('https://example.com/post');
  const different = [
    'https://example.com/post?page=2',
    'https://example.com/Post', // paths are case-sensitive
    'http://example.com/post', // IGNORE_SCHEME is off
    'https://www.example.com/post', // STRIP_WWW is off
    'https://example.com/posts',
    'https://other.com/post',
    'https://example.com:8443/post',
  ];

  for (const url of different) {
    assert.notEqual(normalizeUrl(url), key, `expected ${url} to differ from ${key}`);
  }
});

test('normalizeUrl returns null for anything outside duplicate detection', () => {
  const excluded = [
    'chrome://newtab/',
    'about:blank',
    'file:///C:/tmp/index.html',
    'chrome-extension://abcdef/review.html',
    'not a url',
    '',
    undefined,
    null,
    42,
  ];

  for (const url of excluded) {
    assert.equal(normalizeUrl(url), null, `expected ${String(url)} to be excluded`);
  }
});
