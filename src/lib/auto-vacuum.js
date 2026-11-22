/**
 * One scheduled vacuum pass, run by the background service worker.
 *
 * It is the popup's Vacuum with two differences: nobody clicked, and so every
 * window's active tab is kept (see planAutoVacuum()). Everything else is the
 * shared path — planCleanup()'s protections, and closeTabs()'s re-read of
 * every tab immediately before closing it.
 *
 * `snapshot` and `closer` are injected so the pass is testable with no
 * browser; the defaults are the real thing.
 */

import { queryAllTabs, closeTabsById } from './chrome-tabs.js';
import { closeTabs } from './execute.js';
import { planAutoVacuum } from './vacuum.js';

/** @returns {Promise<{closed: number, closedIds: number[], skipped: Array<{id, reason}>}>} */
export async function runAutoVacuum({ snapshot = queryAllTabs, closer = closeTabsById } = {}) {
  const tabs = await snapshot();
  // Throws MissingTabsPermissionError when urls are redacted. The caller
  // logs it; nothing is closed. Never soften that — see CLAUDE.md.
  const vacuum = planAutoVacuum(tabs);
  if (vacuum.totalClosable === 0) return { closed: 0, closedIds: [], skipped: [] };

  return closeTabs(vacuum.plan, vacuum.closableIds, { snapshot, closer });
}
