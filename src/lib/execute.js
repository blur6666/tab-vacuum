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
import { closeBlockers } from './scan.js';

/**
 * Every tab the UI may offer a checkbox for, keyed by id.
 *
 * Keepers are included on purpose: ★ is a suggestion, and picking a different
 * copy to keep means ticking the one we suggested. Protected tabs are excluded
 * — that is what protection means.
 */
export function closableTabs(plan) {
  const closable = new Map();

  for (const tab of plan.unusedNewTabs) {
    if (tab.closable) closable.set(tab.id, tab);
  }
  for (const group of plan.duplicateGroups) {
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
 * Excluding keepers is what makes the bulk path safe by construction — it
 * cannot empty a duplicate group however the protections fall. Ticking a
 * keeper by hand is still allowed; that is a deliberate one-by-one decision.
 */
export function bulkSelection(plan) {
  const ids = [];

  for (const tab of plan.unusedNewTabs) {
    if (tab.closable) ids.push(tab.id);
  }
  for (const group of plan.duplicateGroups) {
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
  const protectedTab = plan.protectedTabs.find((tab) => tab.id === id);
  if (protectedTab) return protectedTab.reasons.join(', ');

  for (const group of plan.duplicateGroups) {
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

  const live = new Map((await snapshot()).map((tab) => [tab.id, tab]));
  const plannedUrls = urlsById(plan);

  const confirmed = [];
  const skipped = [...refused];

  for (const id of close) {
    const reason = staleReason(live.get(id), plannedUrls.get(id), id, selfTabId);
    if (reason) skipped.push({ id, reason });
    else confirmed.push(id);
  }

  if (confirmed.length === 0) return { closed: 0, closedIds: [], skipped };

  await closer(confirmed);
  return { closed: confirmed.length, closedIds: confirmed, skipped };
}

/** Why this tab must not be closed after all, or null if it is still fair game. */
function staleReason(tab, plannedUrl, id, selfTabId) {
  if (tab === undefined) return 'already gone';
  if (id === selfTabId) return 'this page';
  if ((tab.url ?? '') !== plannedUrl) return 'navigated since the scan';

  const blockers = closeBlockers(tab);
  if (blockers.length > 0) return `now ${blockers.join(', ')}`;

  return null;
}

function urlsById(plan) {
  const urls = new Map();

  for (const tab of plan.unusedNewTabs) urls.set(tab.id, tab.url);
  for (const group of plan.duplicateGroups) {
    for (const tab of group.tabs) urls.set(tab.id, tab.url);
  }

  return urls;
}
