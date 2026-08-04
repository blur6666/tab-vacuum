/**
 * The only place that would ever close a tab — and during the development
 * phase it deliberately cannot.
 *
 * CLAUDE.md rule 1: the live path is not written. Flipping DRY_RUN throws
 * instead of closing anything, so no flag flip and no typo can delete a tab.
 * test/guards.test.js fails the suite if a tab-closing call ever appears in
 * src/ — including in a comment, which is why this one is worded around it.
 */

import { DRY_RUN } from './config.js';

/**
 * @param {number[]} tabIds
 * @returns {{closed: number, wouldClose: number[]}}
 */
export function closeTabs(tabIds) {
  const ids = [...tabIds];

  if (DRY_RUN) {
    console.info('[dry-run] would close', ids);
    return { closed: 0, wouldClose: ids };
  }

  throw new Error(
    'live close path not implemented — see the graduation checklist in README.md',
  );
}
