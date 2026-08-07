#!/usr/bin/env bash
# Zips exactly what the Chrome Web Store needs to load and run the
# extension: manifest.json, the icons it references, and src/. Nothing
# else — no docs, no tests, no package.json, no tmp/, no dotfiles.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

VERSION="$(node -e "process.stdout.write(require('./manifest.json').version)")"
OUT="tab-vacuum-$VERSION.zip"
STAGE="tmp/package"

rm -rf "$STAGE"
mkdir -p "$STAGE"

cp manifest.json icon16.png icon32.png icon48.png icon128.png "$STAGE/"
cp -r src "$STAGE/src"

rm -f "$OUT"

# Compress-Archive, not zip/tar — neither ships with Git Bash on Windows,
# and this repo has no npm dependencies to add one with.
STAGE_WIN="$(cd "$STAGE" && pwd -W)"
OUT_WIN="$(pwd -W)/$OUT"
powershell.exe -NoProfile -NonInteractive -Command \
  "Compress-Archive -Path '$STAGE_WIN/*' -DestinationPath '$OUT_WIN' -Force"

echo "Packaged files:"
find "$STAGE" -type f | sed "s|^$STAGE/|  |" | sort

rm -rf "$STAGE"

echo
echo "Wrote $OUT"
