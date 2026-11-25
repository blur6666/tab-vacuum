/**
 * Service worker. Its only job is Auto-vacuum: while the toggle is on, an
 * alarm fires every few minutes and runs the same cleanup as the popup's
 * "Vacuum 'em all!", silently. While no browser window has focus it does nothing.
 *
 * The alarm exists only while the toggle is on, so with it off the worker is
 * never even woken.
 */

import { getActiveTabId, queryAllTabs } from './lib/chrome-tabs.js';
import { getAutoVacuum, changesAutoVacuum } from './lib/settings.js';
import { AUTO_VACUUM_PERIOD_MINUTES, runAutoVacuum } from './lib/auto-vacuum.js';
import { DEBUG_LOG_AUTO_VACUUM } from './lib/config.js';

const ALARM = 'auto-vacuum';

function debug(...args) {
  if (DEBUG_LOG_AUTO_VACUUM) console.log('[Tab Vacuum]', new Date().toLocaleTimeString(), ...args);
}

/**
 * "Not idle" without the `idle` permission: some browser window has focus.
 * Coarser than real idle detection (a focused window you walked away from
 * still counts), but it needs no permission.
 */
async function browserHasFocus() {
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focused = windows.some((win) => win.focused);
  debug(
    `focus check: ${windows.length} normal windows, focused =`,
    windows.map((win) => `${win.id}:${win.focused ? 'yes' : 'no'}`).join(' '),
    '→', focused ? 'ACTIVE' : 'BACKGROUND',
  );
  return focused;
}

async function syncAlarm() {
  const existing = await chrome.alarms.get(ALARM);
  const enabled = await getAutoVacuum();
  debug('syncAlarm: switch', enabled ? 'ON' : 'OFF', '· alarm', existing ? 'exists' : 'absent');
  if (enabled) {
    // create() restarts the clock, so leave a running alarm alone.
    if (!existing) {
      await chrome.alarms.create(ALARM, { periodInMinutes: AUTO_VACUUM_PERIOD_MINUTES });
      debug('alarm created, every', AUTO_VACUUM_PERIOD_MINUTES, 'min');
    }
  } else if (existing) {
    await chrome.alarms.clear(ALARM);
    debug('alarm cleared');
  }
}

debug('worker started', chrome.runtime.getManifest().version);

// Listeners are registered synchronously at top level so a cold-started worker
// receives the event that woke it.
chrome.runtime.onInstalled.addListener((details) => {
  debug('event: onInstalled', details.reason);
  syncAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  debug('event: onStartup');
  syncAlarm();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (changesAutoVacuum(changes, area)) {
    debug('event: storage changed', JSON.stringify(changes.autoVacuum));
    syncAlarm();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  debug('event: alarm fired', alarm.name, 'scheduled', new Date(alarm.scheduledTime).toLocaleTimeString());
  // A stale alarm must not outlive the toggle.
  if (!(await getAutoVacuum())) return syncAlarm();

  try {
    const result = await runAutoVacuum({
      queryTabs: queryAllTabs,
      isActive: browserHasFocus,
      getActiveTabId,
    });
    if (!result.ran) {
      debug('skipped:', result.why);
      return;
    }
    const { scan } = result;
    debug(
      `scan: ${scan.tabs} tabs in ${scan.windows} windows · active tab ${scan.activeTabId}` +
      ` · ${scan.unusedNewTabs} unused new, ${scan.systemTabs} system, ${scan.duplicateGroups} duplicate groups`,
    );
    for (const tab of scan.protectedTabs) {
      debug('  protected:', tab.reasons.join(', '), '|', tab.title, '|', tab.url);
    }
    for (const tab of scan.candidates) {
      debug('  candidate:', tab.id, tab.why, '|', tab.title, '|', tab.url);
    }
    if (!result.details) {
      debug(`nothing to close (${result.ms} ms)`);
      return;
    }
    debug(`closed ${result.closed}, refused ${result.details.refused.length} (${result.ms} ms)`);
    for (const tab of result.details.closed) debug('  closed :', tab.id, tab.why, '|', tab.title, '|', tab.url);
    for (const tab of result.details.refused) {
      debug('  refused:', tab.id, tab.reason, '|', tab.why, '|', tab.title, '|', tab.url);
    }
  } catch (error) {
    console.warn('Tab Vacuum: auto-vacuum failed', error);
  }
});
