#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fL --retry 3 'https://github.com/zardoy/minecraft-web-client/releases/download/v2.3.0/self-host.zip' -o "$tmp/client.zip"
echo 'f495654376b82cf8dc274677b14e59f228f46ed890ab5dd4fe34fd3c85f7927e  '"$tmp/client.zip" | shasum -a 256 -c -
unzip -q "$tmp/client.zip" -d "$tmp"
# Do not ship source maps or upstream service-worker caching into our private deployment.
find "$tmp/dist" -name '*.map' -delete
rm -f "$tmp/dist/service-worker.js" "$tmp/dist/sw.js"
rm -rf .browser-client
mv "$tmp/dist" .browser-client
printf '%s\n' '{"version":1,"defaultUsername":"Player","promoteServers":[],"defaultProxy":"","rightSideText":"Your private world"}' > .browser-client/config.json
curl -fL 'https://raw.githubusercontent.com/zardoy/minecraft-web-client/v2.3.0/LICENSE' -o .browser-client/LICENSE
