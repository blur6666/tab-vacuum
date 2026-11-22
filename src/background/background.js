/**
 * Service worker. Its only job is the optional auto-vacuum: when the alarm
 * set from the popup fires, run one pass.
 *
 * The listener is registered at top level, synchronously, so Chrome can wake
 * this worker for the alarm after it has been shut down.
 */

import { AUTO_VACUUM_ALARM } from '../lib/schedule.js';
import { runAutoVacuum } from '../lib/auto-vacuum.js';

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_VACUUM_ALARM) return;

  try {
    const outcome = await runAutoVacuum();
    console.info(
      `Tab Vacuum: auto-vacuum closed ${outcome.closed}, skipped ${outcome.skipped.length}`,
      outcome,
    );
  } catch (error) {
    // Includes MissingTabsPermissionError: nothing was closed.
    console.error('Tab Vacuum: auto-vacuum failed', error);
  }
});
