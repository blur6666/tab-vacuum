/**
 * Everything that decides whether a tab may be closed. The call that actually
 * closes one lives in chrome-tabs.js, which is the only file allowed to touch
 * the browser API.
 *
 * This file used to be a dry-run stub. What replaced the dry run is not a flag
 * but three things that hold at runtime:
 *
 *   1. Protections computed by scan.js — a protected tab has no working
 *      checkbox and no bulk action can reach it.
 *   2. An explicit two-click confirm in the UI.
 *   3. revalidate() below, which re-reads every tab immediately before closing
 *      and drops anything that changed since the scan.
 *
 * Layer 3 is the one that matters: a review page can sit open for an hour
 * while tabs navigate, get pinned, or start playing audio underneath it.
 */

import { closeTabsById, queryAllTabs } from './chrome-tabs.js';
import { closeBlockers, protectionReasons } from './scan.js';
import { isNewTabUrl } from './url.js';

/**
 * Every tab the UI may offer a checkbox for, keyed by id.
 *
 * Keepers are included on purpose: ★ is a suggestion, and picking a different
 * copy to keep means ticking the one we suggested. Protected tabs are excluded
 * — that is what protection means.
 */
export function closableTabs(plan) {
  const closable = new Map();

  for (const tab of plan.unusedNewTabs ?? []) {
    if (tab.closable) closable.set(tab.id, tab);
  }
  for (const tab of plan.systemTabs ?? []) {
    if (tab.closable) closable.set(tab.id, tab);
  }
  for (const tab of plan.junkTabs ?? []) {
    if (tab.closable) closable.set(tab.id, tab);
  }
  for (const group of plan.duplicateGroups ?? []) {
    for (const tab of group.tabs) {
      if (tab.closable) closable.set(tab.id, tab);
    }
  }

  return closable;
}

/**
 * What "Kill 'Em All" selects: every unused new tab, plus every duplicate
 * except the one copy each group keeps.
 *
 * System tabs are deliberately not included — Settings or Downloads sitting
 * open is a much more common, intentional thing than a stray new-tab page,
 * so that section gets its own "select all" instead of riding along with the
 * one-click danger button. closableTabs() still includes them, so ticking
 * one by hand and using "Close selected" works the same as anything else.
 */
export function bulkSelection(plan) {
  const ids = [];

  for (const tab of plan.unusedNewTabs ?? []) {
    if (tab.closable) ids.push(tab.id);
  }
  for (const tab of plan.junkTabs ?? []) {
    if (tab.closable) ids.push(tab.id);
  }
  for (const group of plan.duplicateGroups ?? []) {
    for (const tab of group.tabs) {
      if (tab.closable && !tab.isKeeper) ids.push(tab.id);
    }
  }

  return ids;
}

/**
 * Pure. Filters requested ids against the plan, so a stale or hand-crafted
 * selection cannot reach a tab the scan never offered.
 *
 * @returns {{close: number[], refused: Array<{id: number, reason: string}>}}
 */
export function selectClosable(plan, ids) {
  const closable = closableTabs(plan);
  const close = [];
  const refused = [];
  const seen = new Set();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);

    if (closable.has(id)) close.push(id);
    else refused.push({ id, reason: protectionFor(plan, id) });
  }

  return { close, refused };
}

function protectionFor(plan, id) {
  const protectedTab = (plan.protectedTabs ?? []).find((tab) => tab.id === id);
  if (protectedTab) return protectedTab.reasons.join(', ');

  const protectedSystemTab = (plan.protectedSystemTabs ?? []).find((tab) => tab.id === id);
  if (protectedSystemTab) return protectedSystemTab.reasons.join(', ');

  const protectedJunkTab = (plan.protectedJunkTabs ?? []).find((tab) => tab.id === id);
  if (protectedJunkTab) return protectedJunkTab.reasons.join(', ');

  for (const group of plan.duplicateGroups ?? []) {
    const tab = group.tabs.find((candidate) => candidate.id === id);
    if (tab) return tab.protections.join(', ') || 'not closable';
  }

  return 'not in the scan';
}

/**
 * Close the selected tabs, re-checking each one against the live browser first.
 *
 * `closer` and `snapshot` are injected so the policy can be tested with no
 * browser present — the defaults are the real thing.
 *
 * @returns {Promise<{closed: number, closedIds: number[], skipped: Array<{id, reason}>}>}
 */
export async function closeTabs(plan, ids, options = {}) {
  const { closer = closeTabsById, snapshot = queryAllTabs, selfTabId = null } = options;

  const { close, refused } = selectClosable(plan, ids);
  if (close.length === 0) return { closed: 0, closedIds: [], skipped: refused };

  const liveList = await snapshot();
  const live = new Map(liveList.map((tab) => [tab.id, tab]));
  const liveTabsPerWindow = new Map();
  for (const tab of liveList) {
    liveTabsPerWindow.set(tab.windowId, (liveTabsPerWindow.get(tab.windowId) ?? 0) + 1);
  }

  const plannedUrls = urlsById(plan);
  const duplicateIds = new Set(
    (plan.duplicateGroups ?? []).flatMap((group) => group.tabs.map((tab) => tab.id)),
  );

  const confirmed = [];
  const skipped = [...refused];

  for (const id of close) {
    const isDuplicate = duplicateIds.has(id);
    const reason = staleReason(
      live.get(id),
      plannedUrls.get(id),
      id,
      selfTabId,
      isDuplicate,
      liveTabsPerWindow,
    );
    if (reason) skipped.push({ id, reason });
    else confirmed.push(id);
  }

  if (confirmed.length === 0) return { closed: 0, closedIds: [], skipped };

  await closer(confirmed);
  return { closed: confirmed.length, closedIds: confirmed, skipped };
}

/** Why this tab must not be closed after all, or null if it is still fair game. */
function staleReason(tab, plannedUrl, id, selfTabId, isDuplicate = false, tabsPerWindow = new Map()) {
  if (tab === undefined) return 'already gone';
  if (id === selfTabId) return 'this page';
  if ((tab.url ?? '') !== plannedUrl) return 'navigated since the scan';
  if (tab.pendingUrl !== undefined && tab.pendingUrl !== '' && !isNewTabUrl(tab.pendingUrl)) {
    return 'navigating since the scan';
  }

  if (isDuplicate) {
    const blockers = closeBlockers(tab);
    if (blockers.length > 0) return `now ${blockers.join(', ')}`;
  } else {
    const reasons = protectionReasons(tab, tabsPerWindow, selfTabId);
    if (reasons.length > 0) return `now ${reasons.join(', ')}`;
  }

  return null;
}

function urlsById(plan) {
  const urls = new Map();

  for (const tab of plan.unusedNewTabs ?? []) urls.set(tab.id, tab.url);
  for (const tab of plan.systemTabs ?? []) urls.set(tab.id, tab.url);
  for (const tab of plan.junkTabs ?? []) urls.set(tab.id, tab.url);
  for (const group of plan.duplicateGroups ?? []) {
    for (const tab of group.tabs) urls.set(tab.id, tab.url);
  }

  return urls;
}
