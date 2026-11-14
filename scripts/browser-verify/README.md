# Browser verification

The script loads the extension unpacked in a real Chromium and drives the popup. It checks that one click performs Vacuum, lists the tabs closed or skipped, hides the scan breakdown, and leaves decoy pages open.

| Script | Checks |
| --- | --- |
| `vacuum-results.mjs` | One click closes only candidates, lists the tabs closed or skipped, and hides any earlier scan report. |
| `action-popup.mjs` | Opens the real toolbar popup in a visible throw-away browser, removes its active new-tab page, and verifies the restored popup expands with completed results. Uses CDP over Playwright's pipe because toolbar popups are not exposed as Playwright pages. |

## Running them

Playwright is **not** a dependency of this project and must not become one without the decision in TASK-2. Install it outside the repo, as README.md prescribes, and run from there:

```bash
mkdir -p ~/pw && cd ~/pw && npm init -y && npm install playwright
node /path/to/tab-vacuum/scripts/browser-verify/vacuum-results.mjs
```

Nothing here runs during `npm test`. `node --test` only discovers files under `test/`, which is why these live in `scripts/`.

## Notes

- **Throw-away profile, always.** Both scripts `mkdtemp` a fresh `--user-data-dir`. Never point them at a real profile — they close tabs, and CLAUDE.md says so twice.
- **`TABVAC_CHROME`** overrides the browser binary. The default is Playwright's bundled Chromium at `/opt/pw-browsers/chromium/chrome-linux/chrome`; set the variable when yours lives elsewhere, or when the bundled build does not match the installed Playwright.
- **No network.** Pages are served from a local `http` server on loopback, because duplicate detection only accepts `http:`/`https:` and `data:` URLs cannot stand in.
- **Finding the extension id** reads `chrome://extensions-internals/` and matches `name === 'Tab Vacuum'`. Do not take the first id in that dump — Edge ships built-in extensions that appear first. The scripts used to match two names, because the manifest said `Tab Vacuum` while the UI said `Tab Cleanup`; that drift is gone.
- Screenshots land in `tmp/`, which is gitignored.
