#!/bin/bash
set -euo pipefail

write_status() { echo "$1" > /status/step.txt; }
start_service() {
  "$@" >> "/logs/$(basename "$1").log" 2>&1 &
}

backup() {
  curl --silent --fail 'http://127.0.0.1:8083/data?backup=true' >/dev/null || true
}
shutdown() {
  if [ -n "${MINECRAFT_PID:-}" ]; then
    kill -TERM "$MINECRAFT_PID" 2>/dev/null || true
    wait "$MINECRAFT_PID" 2>/dev/null || true
  fi
  backup
  exit 0
}
restore() {
  local bucket="${DATA_BUCKET_NAME:-}"
  [ -n "$bucket" ] || return
  [ -f /data/level.dat ] && return
  for _ in $(seq 1 60); do
    curl --silent --fail http://127.0.0.1:3128/healthcheck 2>/dev/null | grep -qx CONNECTED && break
    sleep .5
  done
  local list latest
  list=$(curl --silent --fail "${AWS_ENDPOINT_URL}/${bucket}/?prefix=backups/&delimiter=" 2>/dev/null) || return
  latest=$(printf '%s' "$list" | grep -o '<Key>backups/[^<]*_data\.tar\.gz</Key>' | head -n 1 | sed 's#<Key>##;s#</Key>##')
  [ -n "$latest" ] && curl --silent --fail "http://127.0.0.1:8083/data?restore=$latest" >/dev/null
}

mkdir -p /data/plugins /logs /status
chown -R 1000:1000 /data /logs /status
ln -sf /data/optional_plugins/playit-minecraft-plugin.jar /data/plugins/playit-minecraft-plugin.jar
for file in /opt/minecraft/server/*; do
  [ -f "$file" ] && ln -sf "$file" "/data/$(basename "$file")"
done

write_status 'Starting backup services'
start_service /usr/local/bin/file-server
start_service /usr/local/bin/http-proxy
write_status 'Restoring world data'
restore || true
write_status 'Starting Minecraft server'
trap shutdown SIGTERM SIGINT
"$@" | /usr/local/bin/hteetp --host 0.0.0.0 --port 8082 --size 1M --text &
MINECRAFT_PID=$!
wait "$MINECRAFT_PID"
