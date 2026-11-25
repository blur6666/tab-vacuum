/**
 * The silent, periodic Vacuum.
 *
 * It is the popup's "Vacuum 'em all!" with no popup: the same planVacuum() and
 * the same closeTabs() revalidation, so every protection the button has applies
 * here unchanged. What differs is when it runs and what it reports — it runs
 * only while the user is active, and it reports nothing.
 *
 * `idleState`, `getActiveTabId`, `snapshot` and `closer` are injected so the
 * policy is testable with no browser, like closeTabs() itself.
 */

import { closeTabs } from './execute.js';
import { MissingTabsPermissionError } from './scan.js';
import { planVacuum } from './vacuum.js';

/** How often the alarm fires. Not precise — the browser may delay it. */
export const AUTO_VACUUM_PERIOD_MINUTES = 5;

/** Seconds without input before the browser counts the user as idle. */
export const IDLE_DETECTION_SECONDS = 60;

/**
 * @param {{
 *   queryTabs: () => Promise<object[]>,
 *   idleState: () => Promise<'active'|'idle'|'locked'>,
 *   getActiveTabId: () => Promise<number|null>,
 *   closer?: Function,
 *   snapshot?: Function,
 * }} deps
 * @returns {Promise<{ran: boolean, closed: number}>}
 */
export async function runAutoVacuum({ queryTabs, idleState, getActiveTabId, closer, snapshot }) {
  // Idle or locked: nobody is accumulating clutter, so do no work at all.
  if ((await idleState()) !== 'active') return { ran: false, closed: 0 };

  try {
    const plan = planVacuum(await queryTabs());
    if (plan.totalClosable === 0) return { ran: true, closed: 0 };

    // With no popup there is no tab to keep alive for display, but the tab
    // the user is looking at right now should not vanish under them either.
    const outcome = await closeTabs(plan.plan, plan.closableIds, {
      selfTabId: await getActiveTabId(),
      ...(closer && { closer }),
      ...(snapshot && { snapshot }),
    });
    return { ran: true, closed: outcome.closed };
  } catch (error) {
    // Revoked `tabs` permission: nothing to do, and nobody to tell.
    if (error instanceof MissingTabsPermissionError) return { ran: false, closed: 0 };
    throw error;
  }
}
