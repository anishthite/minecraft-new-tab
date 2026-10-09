#!/bin/bash
set -euo pipefail
# Run after bun run build:image; Linux ownership cannot be checked on a macOS host.
docker run --rm -i --entrypoint bash "${1:-minecraft-new-tab:local}" -se <<'CHECK'
mkdir -p /tmp/fixture/data/world /opt/minecraft/server
printf original > /tmp/fixture/data/.rcon-cli.env
printf world > /tmp/fixture/data/world/level.dat
chmod 600 /tmp/fixture/data/.rcon-cli.env /tmp/fixture/data/world/level.dat
printf immutable > /opt/minecraft/server/ownership-probe.jar
chown 0:0 /opt/minecraft/server/ownership-probe.jar
ln -s /opt/minecraft/server/ownership-probe.jar /tmp/fixture/data/ownership-probe.jar
tar --owner=1000 --group=1000 -czf /tmp/world.tar.gz -C /tmp/fixture data
chown -R 1000:1000 /data
restore() {
  tar -xzf /tmp/world.tar.gz -C / --no-same-owner
  test "$(stat -c %u /data/.rcon-cli.env)" = 0
}
write_status() { :; }
# Exercise the production restore-to-Paper sequence without starting network services.
eval "$(sed -n '/^restore$/,/^write_status .*Starting Minecraft server/p' /usr/local/bin/start-with-services.sh)"
setpriv --reuid=1000 --regid=1000 --clear-groups sh -c '
  printf updated > /data/.rcon-cli.env
  printf updated > /data/world/level.dat
'
test "$(stat -c %u /opt/minecraft/server/ownership-probe.jar)" = 0
printf 'Restored configuration/world writable by UID 1000; immutable symlink target unchanged.\n'
CHECK
