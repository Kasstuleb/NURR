#!/usr/bin/env bash
# build.sh — create a clean deployable NYMPH copy.
# Run from project root: ./build.sh

set -euo pipefail

OUT="dist"
rm -rf "$OUT"
mkdir -p "$OUT"

copy_if_exists() {
  local src="$1"
  local dst="$OUT/$1"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
  fi
}

copy_if_exists index.html
copy_if_exists CNAME
copy_if_exists LICENSE
copy_if_exists css
copy_if_exists js
copy_if_exists nature
copy_if_exists textures
copy_if_exists assets

# Keep palette.js / palette.css: active modules use the shared colour picker utility.
# Dormant 3D / Palette Lab sources are intentionally not part of this clean base.

find "$OUT" \( -name '.DS_Store' -o -name '._*' -o -name '__MACOSX' \) -exec rm -rf {} +

printf '✓ Built clean deployable copy → %s/\n' "$OUT"
