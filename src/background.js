import { runVacuum } from './lib/vacuum-run.js';

// Transient results only: no storage permission or disk history. A worker keeps
// this job alive even when removing the active tab destroys the action popup.
let state = { status: 'idle' };
let running = null;

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'vacuum-state') {
    respond(state);
    return;
  }
  if (message.type !== 'vacuum-start') return;

  if (!running) {
    state = { status: 'running' };
    running = performVacuum().finally(() => { running = null; });
  }
  running.then(respond);
  return true;
});

async function performVacuum() {
  try {
    const host = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const result = await runVacuum({ windowId: host.id });
    // Publish before reopening: the replacement popup reads this on startup.
    state = { status: 'complete', ...result };
    if (result.restorePopup) {
      try {
        // Tab removal resolves before Chromium finishes dismissing the old
        // bubble. Opening sooner can resolve against that disappearing popup.
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const contexts = await chrome.runtime.getContexts({
            contextTypes: ['POPUP'],
          });
          if (contexts.length === 0) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
        const target = windows.find((window) => window.id === host.id)
          ?? windows.find((window) => window.focused);
        if (target?.focused) await chrome.action.openPopup({ windowId: target.id });
      } catch (error) {
        // Results remain available the next time the user opens the popup.
        console.warn('Could not restore Vacuum results popup', error);
      }
    }
  } catch (error) {
    state = { status: 'error', error: error.message };
  }
  return state;
}
