#!/usr/bin/env bash
set -euo pipefail
echo "[eas-hook] pre-upload: running patch-folly (post-prebuild patch)..."
node scripts/patch-folly.js
