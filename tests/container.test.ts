import { test, expect, mock } from 'bun:test';

mock.module('cloudflare:workers', () => ({ DurableObject: class {} }));
mock.module('../alchemy.run.ts', () => ({ worker: {} }));
mock.module('@cloudflare/containers', () => ({
  Container: class {
    async stop(signal: string) { (this as any).signal = signal; }
    async containerFetch() { throw new Error('SDK auto-start proxy must not be called'); }
  },
  switchPort: (request: Request) => request,
}));
const { MinecraftContainer } = await import('../src/container.ts');

function world() {
  const container = Object.create(MinecraftContainer.prototype) as any;
  const data = new Map<string, unknown>();
  container.ctx = { storage: {
    get: async (key: string) => data.get(key),
    put: async (key: string, value: unknown) => { data.set(key, value); },
    delete: async (key: string) => data.delete(key),
  } };
  container.getStatus = async () => 'running';
  container.schedule = async () => {};
  container.recordSessionStop = () => {};
  return { container, data };
}

test('native runtime state wins over a stale running status', async () => {
  const { container } = world();
  delete container.getStatus;
  container.getState = async () => ({ status: 'running' });
  container._container = { running: false };
  expect(await container.getStatus()).toBe('stopped');
  container._container.running = true;
  expect(await container.getStatus()).toBe('running');
  container.stopping = true;
  expect(await container.getStatus()).toBe('stopping');
});

test('read-only proxying bypasses SDK auto-start and refuses stopped worlds', async () => {
  const { container } = world();
  let calls = 0;
  container._container = { getTcpPort: (port: number) => ({
    fetch: async (url: string, request: Request) => {
      expect(port).toBe(8081);
      expect(url).toBe('http://localhost/__logs');
      expect(request.method).toBe('GET');
      calls++;
      return new Response('logs');
    },
  }) };
  expect(await (await container.containerFetch('https://localhost/__logs', 8081)).text()).toBe('logs');
  for (const state of ['stopped', 'stopping']) {
    container.getStatus = async () => state;
    expect((await container.containerFetch('https://localhost/__logs', 8081)).status).toBe(502);
  }
  expect(calls).toBe(1);
  container.getStatus = async () => 'running';
  let resets = 0;
  container.ctx.abort = () => { resets++; };
  container._container.getTcpPort = () => ({ fetch: async () => { throw new Error('The container is not running'); } });
  await expect(container.containerFetch('https://localhost/__logs', 8081)).rejects.toThrow('not running');
  expect(resets).toBe(1);
  container._container.getTcpPort = () => ({ fetch: async () => { throw new Error('Connection refused'); } });
  await expect(container.containerFetch('https://localhost/__logs', 8081)).rejects.toThrow('Connection refused');
  expect(resets).toBe(1);
});

test('first RCON status request reports actual player count', async () => {
  const { container } = world();
  container.initRcon = async () => {
    container.rcon = Promise.resolve({ send: async () => 'There are 1 of a max of 1 players online: Player' });
    return container.rcon;
  };
  expect(await container.getRconStatus()).toEqual({ online: true, playerCount: 1, maxPlayers: 1 });
});

test('maintenance preserves active world and stops only after empty grace period', async () => {
  const { container, data } = world();
  let stopped = false;
  container.stop = async () => { stopped = true; };
  container.performBackup = async () => ({ success: true });
  container.getRconStatus = async () => ({ online: true, playerCount: 1 });
  data.set('emptySince', Date.now() - 600000);
  await container.maintainWorld();
  expect(stopped).toBe(false);
  expect(data.has('emptySince')).toBe(false);
  container.getRconStatus = async () => ({ online: true, playerCount: 0 });
  await container.maintainWorld();
  expect(stopped).toBe(false);
  data.set('emptySince', Date.now() - 300001);
  await container.maintainWorld();
  expect(stopped).toBe(true);
});

test('failed backup blocks destructive shutdown', async () => {
  const { container } = world();
  container.performBackup = async () => ({ success: false });
  await expect(container.stop()).rejects.toThrow('Backup failed');
  expect(container.signal).toBeUndefined();
  container.performBackup = async () => ({ success: true, backups: [] });
  await container.stop();
  expect(container.signal).toBe('SIGKILL');
});

test('concurrent backup callers share one snapshot', async () => {
  const { container } = world();
  let finish: (value: unknown) => void = () => {};
  let runs = 0;
  container.backupWorld = () => { runs++; return new Promise(resolve => { finish = resolve; }); };
  const first = container.performBackup();
  const second = container.performBackup();
  expect(runs).toBe(1);
  finish({ success: true, backups: [] });
  expect(await first).toEqual(await second);
});

test('backup freezes writes, flushes, snapshots, and restores saving on failure', async () => {
  const { container } = world();
  const commands: string[] = [];
  container.initRcon = async () => ({ send: async (command: string) => { commands.push(command); } });
  container.generateBackupId = () => 'test';
  container.containerFetch = async () => new Response('snapshot failure', { status: 500 });
  expect((await container.performBackup()).success).toBe(false);
  expect(commands).toEqual(['save-off', 'save-all flush', 'save-on']);
});
