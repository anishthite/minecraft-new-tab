# syntax=docker/dockerfile:1.6
FROM oven/bun:1.3.14 AS helpers
WORKDIR /app
COPY docker_src/http-proxy.ts docker_src/file-server.ts ./
RUN bun build --compile http-proxy.ts --outfile http-proxy \
 && bun build --compile file-server.ts --outfile file-server
# Bun's built-in ws shim does not implement createWebSocketStream.
FROM node:22-bookworm-slim AS bridge
WORKDIR /opt/browser-bridge
RUN npm install --omit=dev --no-audit --no-fund ws@8.18.3
COPY scripts/browser-bridge.mjs ./browser-bridge.mjs

FROM itzg/minecraft-server:java21 AS paper-install
RUN mkdir -p /opt/minecraft/server \
 && mc-image-helper install-paper --project=paper --version=1.21.4 \
      --output-directory=/opt/minecraft/server \
      --results-file=/opt/minecraft/server/.paper-1.21.4.env

FROM itzg/minecraft-server:java21
COPY --from=helpers /app/http-proxy /app/file-server /usr/local/bin/
COPY --from=bridge /usr/local/bin/node /usr/local/bin/node
COPY --from=bridge /opt/browser-bridge /opt/browser-bridge
COPY --from=paper-install /opt/minecraft/server /opt/minecraft/server
COPY .browser-client /opt/browser-client
COPY --chmod=755 container_src/start-with-services.sh /usr/local/bin/start-with-services.sh
RUN mkdir -p /data/plugins /logs /status && chown -R 1000:1000 /data /logs /status /opt/minecraft
ENV TYPE=PAPER VERSION=1.21.4 SERVER_PORT=25565 CLIENT_ROOT=/opt/browser-client
ENTRYPOINT ["/usr/local/bin/start-with-services.sh"]
CMD ["/image/scripts/start"]
