#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
rm -f build/real-tray@local.zip
if command -v zip >/dev/null 2>&1; then
  (cd dist && zip -qr ../build/real-tray@local.zip .)
elif command -v bsdtar >/dev/null 2>&1; then
  (cd dist && bsdtar -a -cf ../build/real-tray@local.zip .)
else
  echo "Packaging requires zip or bsdtar (install the zip package)." >&2
  exit 1
fi
echo "Created build/real-tray@local.zip"
