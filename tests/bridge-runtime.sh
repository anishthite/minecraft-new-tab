#!/bin/bash
set -euo pipefail
# Exercise the image's real Node/ws runtime, not just the host implementation.
docker run --rm --entrypoint node \
  -v "$(pwd)/tests:/opt/browser-bridge/tests:ro" \
  -e BRIDGE_MODULE=/opt/browser-bridge/browser-bridge.mjs \
  "${1:-minecraft-new-tab:local}" --test /opt/browser-bridge/tests/browser-bridge.test.mjs
