import http from 'node:http';
import net from 'node:net';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { WebSocketServer, createWebSocketStream } from 'ws';

// Cloudflare must authenticate requests before forwarding to this private service.
export function createBridge({ root, host = '127.0.0.1', port = 25565, local = false }) {
  root = resolve(root);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.woff': 'font/woff', '.mp3': 'audio/mpeg' };
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') return res.writeHead(200).end('OK');
    if (req.url === '/__logs') {
      try {
        const info = await stat('/logs/minecraft.log');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        pipeline(createReadStream('/logs/minecraft.log', { start: Math.max(0, info.size - 1024 * 1024) }), res, () => {});
      } catch { res.writeHead(404).end(); }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname).replace(/^\/play\//, '/');
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep)) return res.writeHead(403).end();
      const info = await stat(file);
      if (!info.isFile()) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      pipeline(createReadStream(file), res, () => {});
    } catch { res.writeHead(404).end('Not found'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path !== '/play/ws' || wss.clients.size >= 1 || (local && req.headers.origin !== `http://${req.headers.host}`)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      const tcp = net.connect({ host, port });
      const stream = createWebSocketStream(ws);
      // Stream piping handles partial TCP writes and backpressure in both directions.
      const close = () => { tcp.destroy(); stream.destroy(); ws.terminate(); };
      tcp.on('error', close);
      stream.on('error', close);
      ws.on('close', close);
      tcp.on('close', close);
      stream.pipe(tcp).pipe(stream);
    });
  });
  return { server, wss };
}

if (import.meta.main || import.meta.url === `file://${process.argv[1]}`) {
  const { server } = createBridge({ root: process.env.CLIENT_ROOT || '.browser-client', host: process.env.MC_HOST || '127.0.0.1', port: Number(process.env.MC_PORT || 25565), local: process.env.LOCAL_ONLY === 'true' });
  server.listen(Number(process.env.PORT || 8081), process.env.LOCAL_ONLY === 'true' ? '127.0.0.1' : '0.0.0.0', () => console.log('Browser bridge ready'));
}
