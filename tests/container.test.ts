import { test, expect, mock } from 'bun:test';

mock.module('cloudflare:workers', () => ({ DurableObject: class {} }));
mock.module('../alchemy.run.ts', () => ({ worker: {} }));
mock.module('@cloudflare/containers', () => ({
  Container: class { async stop(signal: string) { (this as any).signal = signal; } },
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

test('backup freezes writes, flushes, snapshots, and restores saving on failure', async () => {
  const { container } = world();
  const commands: string[] = [];
  container.initRcon = async () => ({ send: async (command: string) => { commands.push(command); } });
  container.generateBackupId = () => 'test';
  container.containerFetch = async () => new Response('snapshot failure', { status: 500 });
  expect((await container.performBackup()).success).toBe(false);
  expect(commands).toEqual(['save-off', 'save-all flush', 'save-on']);
});
