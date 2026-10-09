# Minecraft New Tab

Play a Java-server-compatible Minecraft client **inside your browser**, with a private Paper world hosted in a Cloudflare Container. Based on [Mineflare](https://github.com/eastlondoner/mineflare) and [Minecraft Web Client](https://github.com/zardoy/minecraft-web-client).

```text
New-tab extension → dashboard → Play
Browser client → authenticated Worker → WebSocket bridge → Paper
                                                        ↕
                                                 private R2 backups
```

This is an **unofficial browser client**, not Mojang's Java client. Expect compatibility and visual differences. We pin client release `v2.3.0` and Paper `1.21.4`; do not downgrade a newer world into this setup. The upstream client's MIT code license does not confer rights to every game asset or replace Minecraft ownership.

**Status:** local browser play and real Cloudflare save/stop/start restoration are verified on a fresh Paper 1.21.4 world. Existing and newly placed test blocks survived R2 recovery. This remains an unofficial client: validate your own deployment before trusting an important world.

## Try it locally first

Clone **this fork**, not unmodified upstream Mineflare, and open a terminal in the repository root.

Requirements: Docker with Compose, Bun, Node.js 22+, `curl`, `unzip`, and `shasum`. Docker must be running. Running Minecraft implies acceptance of [Minecraft's EULA](https://www.minecraft.net/eula).

```sh
bun install --frozen-lockfile
bun run prepare:client
# A fresh world is created in a Docker volume, separate from any cloud world.
docker compose up -d
bun run play:local
```

Wait for `Done (...)!` in `docker compose logs -f minecraft`. First boot downloads server files and generates terrain, so it can take several minutes.

Open this URL and click **Connect**:

```text
http://127.0.0.1:8081/play/?ip=ws%3A%2F%2F127.0.0.1%3A8081%2Fplay%2Fws&version=1.21.4&username=Player&setting=frameLimit%3A60&setting=rendererWorldPerformance%3A%22low-energy%22&setting=packetsRecordingAutoStart%3Afalse&setting=displayRecordButton%3Afalse
```

Click inside the game to capture the mouse; press Escape to release it. The browser bridge and game TCP port are bound to **loopback only**. Offline-mode identities are acceptable here because strangers cannot reach the server; do not expose these ports publicly.

To stop:

```sh
# Ctrl+C in the bridge terminal, then:
docker compose down
```

The Docker volume preserves the local world. **Do not add `-v`** unless you intend to delete it. Local mode uses this persistent volume, not R2.

## Deploy to Cloudflare

Requirements: an existing **Workers Paid** account, enabled R2 and Containers, Docker, and deployment credentials. Containers are metered separately: paid Workers is not unlimited free Minecraft hosting.

1. Install dependencies and prepare the browser client as above.
2. Copy `.env.example` to `.env`.
3. Set `CLOUDFLARE_ACCOUNT_ID` to the intended account and provide an API token authorized to manage Workers, Containers, R2, and Secrets Store. Alternatively run `bun run configure`, then `bun run login`, and select the intended account in Alchemy. A Wrangler login alone is not an Alchemy login.
4. Generate **three different** values with `openssl rand -hex 32`; use them for `MINEFLARE_SETUP_TOKEN`, `ALCHEMY_PASSWORD`, and `ALCHEMY_STATE_TOKEN`. Keep `.env` private and backed up; it is ignored by Git and the Docker build.
5. Verify and build:

   ```sh
   bun run test
   bun run build
   bun run build:image
   bash tests/restore-ownership.sh
   bash tests/bridge-runtime.sh
   ```

6. Deploy:

   ```sh
   bun run deploy
   ```

   If Bun `1.3.14` crashes with this older Alchemy release, run the compatible runtime directly after building:

   ```sh
   NODE_ENV=production npx -y bun@1.3.0 --env-file .env alchemy.run.ts
   ```

7. Open the **main Worker URL** printed by deployment. Choose a password, then enter your `MINEFLARE_SETUP_TOKEN` in the setup-key prompt. This key prevents anyone else from claiming the public first-use setup page.
8. Click **Start world**. Once Paper is ready, click **Play in this tab**, then **Connect** in the browser client.

The default deployment name is `minecraft-new-tab`. Set `WRANGLER_CI_OVERRIDE_NAME` only when deliberately creating another deployment; a new name creates new state and storage. Do not point this version at an existing newer-version world's backup bucket.

### Resources and persistence

- One `standard-1` instance: 0.5 vCPU, 4 GiB RAM, 8 GB disk; JVM heap 1–3 GB.
- One player, six-chunk server view distance, four-chunk simulation distance.
- Browser rendering capped at 60 FPS with low-energy mode; packet recording disabled by default.
- Dashboard reads do not start the server; `POST /api/start` does.
- Maintenance checks player counts every minute, backs up every 15 minutes, and stops after five empty minutes.
- Backup freezes world saving, flushes disk state, snapshots `/data`, then restores saving.
- A failed backup blocks destructive shutdown. A failed restore aborts startup rather than silently creating a replacement world. This can retain billable compute: investigate failures promptly.
- Container disk is ephemeral; R2 is the durable cloud copy. Abrupt infrastructure failure can lose progress since the last successful backup.
- The private data bucket is retained on infrastructure teardown. Backups accumulate; monitor R2 usage and set an appropriate retention policy after verifying restores.

The deployment provisions the main Worker, one game Container, a private data bucket, authentication secrets, and Alchemy's state store. The image excludes the development desktop, coding agents, Dynmap, and public playit tunnel; no MCP or Dynmap Worker is deployed. Some unused upstream source files remain for reference.

### Security

Cloud gameplay is offline-mode **behind your authenticated Worker**, not Microsoft-account authentication. All game assets and game WebSocket upgrades require the dashboard cookie; sockets also enforce same-origin requests. The bridge has a fixed local Paper target and cannot be used as an arbitrary TCP proxy. No public TCP tunnel is installed.

Do not enable public tunneling or expose Minecraft's port without adding proper Minecraft account authentication. Use a strong dashboard password. RCON is for administration; never share its authenticated dashboard access.

## Install the new-tab extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository's `extension/` directory.
4. Open a new tab and enter your deployed main dashboard URL.

Subsequent tabs open that dashboard. **The world starts only when you click Start world.** Change the URL through the extension's **Options** page. For local testing, enter the complete localhost play URL above instead.

The extension only requests local storage permission; it neither stores Minecraft credentials nor loads remote code in an extension page. It navigates to the hosted app.

## Checks and troubleshooting

```sh
bun run test          # Binary bridge/security checks + container lifecycle regression tests
bun run build:worker  # TypeScript check
bash -n container_src/start-with-services.sh
# After building the image:
bash tests/restore-ownership.sh
bash tests/bridge-runtime.sh
```

| Problem | Check |
|---|---|
| Cannot connect locally | Docker running, Paper logs contain `Done`, bridge listening on 8081; use `127.0.0.1` consistently. |
| Game is slow | Keep packet recording off; try low-energy mode, 60 FPS cap, and a shorter render distance; graphics run on your device, not Cloudflare. |
| Connection lost after tab is inactive | Reconnect; browsers can throttle background game tabs and interrupt protocol keepalives. |
| Cloud game says to start the world | Return to the dashboard and click Start world; readiness takes longer than container startup. |
| Container says running but Paper is offline | Container services start before Paper; wait for `Done` in the game logs. Inspect restore/startup errors if it never becomes online. |
| Setup returns 403 | Enter the deployment's setup key from `.env`, not the dashboard password. |
| Backups/restores fail | Check Worker and container logs, R2 permissions, and the proxy connection; do not delete the running container or the R2 bucket. |
| Empty world keeps running | Inspect maintenance/RCON errors; missing player counts or failed backups intentionally prevent unsafe shutdown. |

Before trusting an important world, test mining, crafting, inventory, combat, death/respawn, reconnect, and save/restart. **Also test a cloud stop/start restore and verify a known placed block or inventory item survives.** Passing unit tests is not evidence that a particular account's R2 integration works.

## Development

- `src/worker.ts`: authenticated routing and start/stop APIs.
- `src/container.ts`: singleton world lifecycle, RCON, maintenance and R2 integration.
- `scripts/browser-bridge.mjs`: static client serving and fixed-target WebSocket/TCP bridge.
- `scripts/prepare-client.sh`: checksum-pinned client release download.
- `container_src/`: minimal image and fail-closed restore/shutdown entrypoint.
- `extension/`: new-tab launcher.
- `implementation-notes/`: decisions, tradeoffs, and validation history.

Commits do not contain generated browser assets, world data, or deployment credentials. Keep upstream license notices when distributing the browser client.
