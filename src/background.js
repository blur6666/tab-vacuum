/**
 * Tab Vacuum background service worker.
 *
 * Sets up the right-click context menu on the extension icon to trigger
 * an immediate vacuum (scan and cleanup) without opening the popup.
 */

import { queryAllTabs } from './lib/chrome-tabs.js';
import { hasTabsPermission } from './lib/permissions.js';
import { planVacuum } from './lib/vacuum.js';
import { closeTabs } from './lib/execute.js';

// Create context menu item for the extension icon
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'vacuum-now',
    title: 'Vacuum tabs now',
    contexts: ['action'],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'vacuum-now') return;

  try {
    const granted = await hasTabsPermission();
    if (!granted) {
      console.warn('Tab Vacuum: tabs permission not granted');
      return;
    }

    const tabs = await queryAllTabs();
    const result = planVacuum(tabs);

    if (result.totalClosable === 0) {
      console.log('Tab Vacuum: no tabs to clean up');
      return;
    }

    await closeTabs(result.plan, result.closableIds);
    console.log(`Tab Vacuum: closed ${result.totalClosable} tab(s)`);
  } catch (error) {
    console.error('Tab Vacuum error:', error);
  }
});
