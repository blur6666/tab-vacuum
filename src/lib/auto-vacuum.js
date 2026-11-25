/**
 * The silent, periodic Vacuum.
 *
 * It is the popup's "Vacuum 'em all!" with no popup: the same planVacuum() and
 * the same closeTabs() revalidation, so every protection the button has applies
 * here unchanged. What differs is when it runs and what it reports — it runs
 * only while the user is active, and it reports nothing.
 *
 * `isActive`, `getActiveTabId`, `snapshot` and `closer` are injected so the
 * policy is testable with no browser, like closeTabs() itself.
 */

import { closeTabs } from './execute.js';
import { MissingTabsPermissionError } from './scan.js';
import { planVacuum } from './vacuum.js';

/** How often the alarm fires. Not precise — the browser may delay it. */
export const AUTO_VACUUM_PERIOD_MINUTES = 5;

/**
 * @param {{
 *   queryTabs: () => Promise<object[]>,
 *   isActive: () => Promise<boolean>,
 *   getActiveTabId: () => Promise<number|null>,
 *   closer?: Function,
 *   snapshot?: Function,
 * }} deps
 * @returns {Promise<{ran: boolean, closed: number}>}
 */
export async function runAutoVacuum({ queryTabs, isActive, getActiveTabId, closer, snapshot }) {
  const startedAt = Date.now();

  // Browser in the background: nobody is accumulating clutter, so do no work.
  if (!(await isActive())) return { ran: false, closed: 0, why: 'browser in background' };

  try {
    const tabs = await queryTabs();
    const plan = planVacuum(tabs);
    const byId = new Map(plan.rows.map((row) => [row.id, row]));
    const activeTabId = await getActiveTabId();

    // Everything below is for the debug log only.
    const scan = {
      tabs: tabs.length,
      windows: new Set(tabs.map((tab) => tab.windowId)).size,
      activeTabId,
      unusedNewTabs: plan.plan.unusedNewTabs.length,
      systemTabs: plan.plan.systemTabs.length,
      duplicateGroups: plan.plan.duplicateGroups.length,
      candidates: plan.rows,
      protectedTabs: [...plan.plan.protectedTabs, ...(plan.plan.protectedSystemTabs ?? [])].map(
        (tab) => ({ id: tab.id, url: tab.url, title: tab.title, reasons: tab.reasons }),
      ),
    };

    if (plan.totalClosable === 0) {
      return { ran: true, closed: 0, skipped: [], scan, ms: Date.now() - startedAt };
    }

    // With no popup there is no tab to keep alive for display, but the tab
    // the user is looking at right now should not vanish under them either.
    const outcome = await closeTabs(plan.plan, plan.closableIds, {
      selfTabId: activeTabId,
      ...(closer && { closer }),
      ...(snapshot && { snapshot }),
    });
    return {
      ran: true,
      closed: outcome.closed,
      skipped: outcome.skipped.map(({ reason }) => reason),
      scan,
      ms: Date.now() - startedAt,
      details: {
        closed: outcome.closedIds.map((id) => byId.get(id) ?? { id }),
        refused: outcome.skipped.map(({ id, reason }) => ({ ...(byId.get(id) ?? { id }), reason })),
      },
    };
  } catch (error) {
    // Revoked `tabs` permission: nothing to do, and nobody to tell.
    if (error instanceof MissingTabsPermissionError) {
      return { ran: false, closed: 0, why: 'tabs permission missing' };
    }
    throw error;
  }
}
