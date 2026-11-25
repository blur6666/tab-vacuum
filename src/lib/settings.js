/**
 * The one persisted setting: whether Auto-vacuum is on. Off by default —
 * closing tabs unprompted is something you opt in to.
 *
 * Only this flag is stored; no tab data is ever written to disk.
 */

const KEY = 'autoVacuum';

export async function getAutoVacuum() {
  const stored = await chrome.storage.local.get({ [KEY]: false });
  return stored[KEY] === true;
}

export function setAutoVacuum(enabled) {
  return chrome.storage.local.set({ [KEY]: enabled === true });
}

/** True when a storage.onChanged payload touches the Auto-vacuum flag. */
export function changesAutoVacuum(changes, areaName) {
  return areaName === 'local' && KEY in changes;
}
