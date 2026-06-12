#!/usr/bin/env bash
set -euo pipefail
echo "[eas-hook] post-install: running patch-folly (clean + patch)..."
PATCH_FOLLY_CLEAN=1 node scripts/patch-folly.js
