import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createBridge } from '../scripts/browser-bridge.mjs';

test('private fixed-target bridge serves client and forwards binary Minecraft traffic', { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-bridge-'));
  await writeFile(join(root, 'index.html'), '<h1>Play</h1>');
  const tcp = net.createServer(socket => socket.pipe(socket));
  tcp.listen(0, '127.0.0.1');
  await once(tcp, 'listening');
  const { server, wss } = createBridge({ root, port: tcp.address().port, local: true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await (await fetch(origin + '/play/')).text(), '<h1>Play</h1>');
    assert.equal((await fetch(origin + '/play/%2f..%2fsecret')).status, 403);
    const rejected = new WebSocket(origin.replace('http:', 'ws:') + '/play/ws', { origin: 'https://evil.example' });
    rejected.on('error', () => {});
    assert.equal((await once(rejected, 'unexpected-response'))[1].statusCode, 403);
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/play/ws?host=evil.example', { origin });
    await once(ws, 'open');
    const message = once(ws, 'message');
    const bytes = Buffer.from([0, 255, 1, 128, 0, 42]);
    ws.send(bytes);
    assert.deepEqual((await message)[0], bytes);
    ws.close();
    await once(ws, 'close');
  } finally {
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => tcp.close(resolve));
    await rm(root, { recursive: true });
  }
});
