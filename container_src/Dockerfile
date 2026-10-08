# syntax=docker/dockerfile:1.6

FROM itzg/minecraft-server:latest AS paper-install
RUN mkdir -p /opt/minecraft/server \
 && /usr/bin/mc-image-helper install-paper \
      --project=paper --version=1.21.8 \
      --output-directory=/opt/minecraft/server \
      --results-file=/opt/minecraft/server/.paper.env

FROM itzg/minecraft-server:latest

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates sudo \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/plugins /logs /status \
 && chown -R 1000:1000 /data /logs /status

COPY --from=paper-install /opt/minecraft/server /opt/minecraft/server
COPY --chmod=755 start-with-services.sh /usr/local/bin/start-with-services.sh
COPY --chmod=755 http-proxy-x64 http-proxy-arm64 file-server-x64 file-server-arm64 hteetp-linux-x64 hteetp-linux-arm64 /tmp/
COPY --chmod=755 optional_plugins/playit-minecraft-plugin.jar /data/optional_plugins/playit-minecraft-plugin.jar

ARG TARGETARCH
RUN set -eux; \
    case "$TARGETARCH" in amd64) arch=x64 ;; arm64) arch=arm64 ;; *) exit 1 ;; esac; \
    mv "/tmp/http-proxy-$arch" /usr/local/bin/http-proxy; \
    mv "/tmp/file-server-$arch" /usr/local/bin/file-server; \
    mv "/tmp/hteetp-linux-$arch" /usr/local/bin/hteetp; \
    rm -rf /tmp/*; \
    chown -R 1000:1000 /opt/minecraft /data

ENV TYPE=PAPER VERSION=1.21.8 SERVER_PORT=25565
ENTRYPOINT ["/usr/local/bin/start-with-services.sh"]
CMD ["/image/scripts/start"]
