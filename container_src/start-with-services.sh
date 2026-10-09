#!/bin/bash
set -euo pipefail
write_status() { echo "$1" > /status/step.txt; }

backup() {
  [ -n "${DATA_BUCKET_NAME:-}" ] || return 0
  curl --silent --show-error --fail 'http://127.0.0.1:8083/data?backup=true' > /logs/shutdown-backup.json
}
shutdown() {
  trap '' SIGTERM SIGINT
  write_status 'Saving world before shutdown'
  kill -TERM "$MINECRAFT_PID" 2>/dev/null || true
  wait "$MINECRAFT_PID" 2>/dev/null || true
  if ! backup; then
    write_status 'Backup failed; keeping container alive for recovery'
    while true; do sleep 60; done
  fi
  exit 0
}
restore() {
  local bucket="${DATA_BUCKET_NAME:-}"
  [ -n "$bucket" ] || return 0
  local connected=false
  for _ in $(seq 1 120); do
    if curl --silent --fail http://127.0.0.1:3128/healthcheck 2>/dev/null | grep -qx CONNECTED; then
      connected=true
      break
    fi
    sleep .5
  done
  [ "$connected" = true ] || { echo 'Backup proxy unavailable; refusing to create a replacement world'; return 1; }
  local list latest
  list=$(curl --silent --show-error --fail "${AWS_ENDPOINT_URL}/${bucket}/?prefix=backups/&delimiter=")
  latest=$(printf '%s' "$list" | { grep -o '<Key>backups/[^<]*_data\.tar\.gz</Key>' || true; } | sed -n '1{s#<Key>##;s#</Key>##;p;}')
  if [ -n "$latest" ]; then
    curl --silent --show-error --fail "http://127.0.0.1:8083/data?restore=$latest" > /logs/restore.json
  fi
}

mkdir -p /data/plugins /logs /status
chown -R 1000:1000 /data /logs /status
write_status 'Starting backup and browser services'
/usr/local/bin/file-server > /logs/file-server.log 2>&1 &
/usr/local/bin/http-proxy > /logs/http-proxy.log 2>&1 &
/usr/local/bin/browser-bridge > /logs/browser-bridge.log 2>&1 &
write_status 'Restoring world data'
restore
# Root extracts backups; the image's restored UID marker can skip its own chown.
chown -Rh 1000:1000 /data
# Relink after restore and remove plugins from old development-profile backups.
rm -f /data/plugins/dynmap.jar /data/plugins/Dynmap-*.jar /data/plugins/playit-minecraft-plugin.jar
for file in /opt/minecraft/server/* /opt/minecraft/server/.paper-*.env; do
  [ -f "$file" ] && ln -sf "$file" "/data/$(basename "$file")"
done
write_status 'Starting Minecraft server'
"$@" > /logs/minecraft.log 2>&1 &
MINECRAFT_PID=$!
trap shutdown SIGTERM SIGINT
wait "$MINECRAFT_PID" || true
shutdown
