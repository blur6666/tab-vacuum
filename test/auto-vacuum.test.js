/**
 * The scheduled auto-vacuum: what one pass may close, and how the on/off
 * switch maps onto a single alarm.
 *
 * A timer closes tabs nobody chose in that moment, so the tests that matter
 * are the negative ones: the front tab of every window survives, protections
 * hold, and a redacted-url profile closes nothing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { planAutoVacuum } from '../src/lib/vacuum.js';
import { runAutoVacuum } from '../src/lib/auto-vacuum.js';
import {
  AUTO_VACUUM_ALARM,
  getAutoVacuumSchedule,
  setAutoVacuumEnabled,
} from '../src/lib/schedule.js';
import { AUTO_VACUUM_PERIOD_MINUTES } from '../src/lib/config.js';
import { MissingTabsPermissionError } from '../src/lib/scan.js';

let nextId = 500;

function tab(overrides = {}) {
  const id = overrides.id ?? nextId++;
  return {
    id,
    windowId: 1,
    index: id,
    url: `https://example.com/${id}`,
    title: 'Example Page',
    pinned: false,
    active: false,
    audible: false,
    groupId: -1,
    windowType: 'normal',
    incognito: false,
    lastAccessed: 1_000,
    ...overrides,
  };
}

function fakeBrowser(tabs) {
  let live = [...tabs];
  const closed = [];
  return {
    closed,
    snapshot: async () => live,
    closer: async (ids) => {
      closed.push(...ids);
      live = live.filter((t) => !ids.includes(t.id));
    },
  };
}

test('keeps the active tab of every window, closes the rest of the vacuum set', async () => {
  const front1 = tab({ windowId: 1, url: 'chrome://newtab/', active: true });
  const back1 = tab({ windowId: 1, url: 'chrome://newtab/' });
  const front2 = tab({ windowId: 2, url: 'chrome://settings/', active: true });
  const back2 = tab({ windowId: 2, url: 'chrome://downloads/' });
  const page1 = tab({ windowId: 1 });
  const page2 = tab({ windowId: 2 });

  const plan = planAutoVacuum([front1, back1, front2, back2, page1, page2]);
  assert.deepEqual(plan.closableIds.sort(), [back1.id, back2.id].sort());

  const browser = fakeBrowser([front1, back1, front2, back2, page1, page2]);
  const outcome = await runAutoVacuum(browser);
  assert.deepEqual(browser.closed.sort(), [back1.id, back2.id].sort());
  assert.equal(outcome.closed, 2);
});

test('an active duplicate survives even when it is not the keeper', async () => {
  const keeper = tab({ url: 'https://dup.example/', pinned: false, lastAccessed: 9_000 });
  const activeCopy = tab({ url: 'https://dup.example/', active: true, windowId: 2 });
  const filler = tab({ windowId: 2 });

  const plan = planAutoVacuum([keeper, activeCopy, filler, tab()]);
  assert.equal(plan.closableIds.includes(activeCopy.id), false);
  // One copy always survives, and the active one is it.
  assert.equal(plan.closableIds.length <= 1, true);
});

test('protected tabs are never reached', async () => {
  const pinned = tab({ url: 'chrome://newtab/', pinned: true });
  const audible = tab({ url: 'chrome://newtab/', audible: true });
  const browser = fakeBrowser([pinned, audible, tab({ active: true })]);

  await runAutoVacuum(browser);
  assert.deepEqual(browser.closed, []);
});

test('a tab that navigated between scan and close is skipped', async () => {
  const blank = tab({ url: 'chrome://newtab/' });
  const tabs = [blank, tab({ active: true })];
  let calls = 0;
  const closed = [];
  const outcome = await runAutoVacuum({
    snapshot: async () => {
      calls += 1;
      return calls === 1 ? tabs : tabs.map((t) => (t.id === blank.id ? { ...t, url: 'https://news.example/' } : t));
    },
    closer: async (ids) => closed.push(...ids),
  });

  assert.deepEqual(closed, []);
  assert.deepEqual(outcome.skipped, [{ id: blank.id, reason: 'navigated since the scan' }]);
});

test('redacted urls throw and close nothing', async () => {
  const closed = [];
  await assert.rejects(
    runAutoVacuum({
      snapshot: async () => [{ ...tab(), url: undefined }, { ...tab(), url: undefined }],
      closer: async (ids) => closed.push(...ids),
    }),
    MissingTabsPermissionError,
  );
  assert.deepEqual(closed, []);
});

test('nothing to do means no close call at all', async () => {
  let closerCalled = false;
  await runAutoVacuum({
    snapshot: async () => [tab({ active: true }), tab()],
    closer: async () => { closerCalled = true; },
  });
  assert.equal(closerCalled, false);
});

test('the switch is one alarm: on creates it with the period, off clears it', async (t) => {
  const previousChrome = globalThis.chrome;
  t.after(() => {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  });

  const alarms = new Map();
  globalThis.chrome = {
    alarms: {
      get: async (name) => alarms.get(name),
      create: async (name, info) => {
        alarms.set(name, { name, ...info, scheduledTime: 1_000 + info.delayInMinutes * 60_000 });
      },
      clear: async (name) => alarms.delete(name),
    },
  };

  assert.deepEqual(await getAutoVacuumSchedule(), { enabled: false, nextRun: null });

  const on = await setAutoVacuumEnabled(true);
  assert.equal(on.enabled, true);
  const alarm = alarms.get(AUTO_VACUUM_ALARM);
  assert.equal(AUTO_VACUUM_PERIOD_MINUTES, 15);
  assert.equal(alarm.periodInMinutes, 15);
  // Switching on is not a request to vacuum right now.
  assert.equal(alarm.delayInMinutes, 15);

  assert.deepEqual(await setAutoVacuumEnabled(false), { enabled: false, nextRun: null });
  assert.equal(alarms.size, 0);
});
