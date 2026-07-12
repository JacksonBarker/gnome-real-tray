#!/usr/bin/env bash
set -euo pipefail
target="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/real-tray@local"
rm -rf "$target"
mkdir -p "$target"
cp -a dist/. "$target/"
echo "Installed to $target"
