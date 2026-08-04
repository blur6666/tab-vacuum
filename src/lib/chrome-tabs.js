/**
 * The only file allowed to call chrome.tabs (CLAUDE.md architecture rule).
 * Keeping it this thin is what lets scan.js stay pure and unit-testable.
 *
 * None of these calls require a permission. `tabs` is needed only to read the
 * url / pendingUrl / title / favIconUrl fields off the objects they return.
 */

/** Browsing tabs only — devtools, app and popup windows are not tabs a user cleans up. */
export function queryAllTabs() {
  return chrome.tabs.query({ windowType: 'normal' });
}

/** The tab this page is running in, or null when called from the popup. */
export async function getSelfTabId() {
  const tab = await chrome.tabs.getCurrent();
  return tab?.id ?? null;
}

export function openReviewPage() {
  return chrome.tabs.create({ url: chrome.runtime.getURL('src/review/review.html') });
}
