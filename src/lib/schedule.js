/**
 * The auto-vacuum schedule, as a single named chrome.alarms alarm.
 *
 * The alarm's existence IS the on/off setting. That is what keeps the
 * `storage` permission out of the manifest: there is no preference to save,
 * only an alarm that is either registered or not.
 *
 * Chrome keeps alarms across service-worker restarts, but documents that they
 * may be cleared when the browser restarts or the extension updates. If that
 * happens the popup's switch simply reads off again — the failure mode is
 * "stopped vacuuming", never "vacuumed when it should not have".
 */

import { AUTO_VACUUM_PERIOD_MINUTES } from './config.js';

export const AUTO_VACUUM_ALARM = 'auto-vacuum';

/** @returns {Promise<{enabled: boolean, nextRun: number|null}>} */
export async function getAutoVacuumSchedule() {
  const alarm = await chrome.alarms.get(AUTO_VACUUM_ALARM);
  return { enabled: alarm !== undefined, nextRun: alarm?.scheduledTime ?? null };
}

/**
 * First run is one full period from now, not immediately: switching the
 * option on is not a request to vacuum this instant — that is the button.
 */
export async function setAutoVacuumEnabled(enabled) {
  if (enabled) {
    await chrome.alarms.create(AUTO_VACUUM_ALARM, {
      delayInMinutes: AUTO_VACUUM_PERIOD_MINUTES,
      periodInMinutes: AUTO_VACUUM_PERIOD_MINUTES,
    });
  } else {
    await chrome.alarms.clear(AUTO_VACUUM_ALARM);
  }
  return getAutoVacuumSchedule();
}
