/**
 * Service worker. Its only job is Auto-vacuum: while the toggle is on, an
 * alarm fires every few minutes and runs the same cleanup as the popup's
 * "Vacuum 'em all!", silently. While the user is idle it does nothing.
 *
 * The alarm exists only while the toggle is on, so with it off the worker is
 * never even woken.
 */

import { getActiveTabId, queryAllTabs } from './lib/chrome-tabs.js';
import { getAutoVacuum, changesAutoVacuum } from './lib/settings.js';
import {
  AUTO_VACUUM_PERIOD_MINUTES,
  IDLE_DETECTION_SECONDS,
  runAutoVacuum,
} from './lib/auto-vacuum.js';

const ALARM = 'auto-vacuum';

async function syncAlarm() {
  const existing = await chrome.alarms.get(ALARM);
  if (await getAutoVacuum()) {
    // create() restarts the clock, so leave a running alarm alone.
    if (!existing) await chrome.alarms.create(ALARM, { periodInMinutes: AUTO_VACUUM_PERIOD_MINUTES });
  } else if (existing) {
    await chrome.alarms.clear(ALARM);
  }
}

// Listeners are registered synchronously at top level so a cold-started worker
// receives the event that woke it.
chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(syncAlarm);

chrome.storage.onChanged.addListener((changes, area) => {
  if (changesAutoVacuum(changes, area)) syncAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  // A stale alarm must not outlive the toggle.
  if (!(await getAutoVacuum())) return syncAlarm();

  try {
    await runAutoVacuum({
      queryTabs: queryAllTabs,
      idleState: () => chrome.idle.queryState(IDLE_DETECTION_SECONDS),
      getActiveTabId,
    });
  } catch (error) {
    console.warn('Tab Vacuum: auto-vacuum failed', error);
  }
});
