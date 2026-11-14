/**
 * The only file allowed to call chrome.tabs or chrome.tabGroups (CLAUDE.md
 * architecture rule). Keeping it this thin is what lets scan.js stay pure and
 * unit-testable.
 *
 * Reading and closing tabs requires no permission at all. `tabs` is needed only
 * to read the url / pendingUrl / title / favIconUrl fields off the objects
 * these calls return.
 *
 * This file decides nothing. What may be closed is execute.js's job.
 */

/** Browsing tabs only — devtools, app and popup windows are not tabs a user cleans up. */
export function queryAllTabs() {
  return chrome.tabs.query({ windowType: 'normal' });
}

/** The browser tab beneath the extension popup in the last-focused window. */
export async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
}

/**
 * The one real close call in the codebase. Everything that decides *whether*
 * to call it lives in execute.js; test/guards.test.js fails the suite if this
 * call appears in any other file.
 */
export function closeTabsById(ids) {
  return chrome.tabs.remove(ids);
}

/**
 * Tab group names and colours, keyed by group id.
 *
 * `tabGroups` is optional and carries its own warning, so this resolves to an
 * empty map whenever it has not been granted. Callers fall back to numbering
 * groups; nothing about deduplication depends on it.
 */
export async function queryGroupsById() {
  if (typeof chrome.tabGroups === 'undefined') return new Map();

  try {
    const groups = await chrome.tabGroups.query({});
    return new Map(groups.map((group) => [group.id, group]));
  } catch {
    // Permission revoked between the check and the call.
    return new Map();
  }
}

/** The tab this page is running in, or null when called from the popup. */
export async function getSelfTabId() {
  const tab = await chrome.tabs.getCurrent();
  return tab?.id ?? null;
}

export function openReviewPage() {
  return chrome.tabs.create({ url: chrome.runtime.getURL('src/review/review.html') });
}
