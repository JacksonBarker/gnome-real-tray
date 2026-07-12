#!/usr/bin/env bash
set -euo pipefail
rm -rf dist
npx tsc -p tsconfig.build.json
cp metadata.json stylesheet.css LICENSE dist/
mkdir -p dist/schemas
cp schemas/*.xml dist/schemas/
glib-compile-schemas dist/schemas
