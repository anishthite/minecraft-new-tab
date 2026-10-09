import alchemy, { type Scope } from 'alchemy';
import { CloudflareStateStore, SQLiteStateStore } from 'alchemy/state';
import { Container, R2Bucket, BunSPA, Secret, type Worker } from 'alchemy/cloudflare';
import type { MinecraftContainer } from './src/container';

const name = process.env.WRANGLER_CI_OVERRIDE_NAME ?? 'minecraft-new-tab';
const stateStore = (scope: Scope) => new CloudflareStateStore(scope, {
  stateToken: alchemy.secret(process.env.ALCHEMY_STATE_TOKEN || ''),
  scriptName: 'mineflare-alchemy-state-store',
});
if (!process.env.ALCHEMY_PASSWORD || !process.env.ALCHEMY_STATE_TOKEN || !process.env.MINEFLARE_SETUP_TOKEN) {
  throw new Error('Set ALCHEMY_PASSWORD, ALCHEMY_STATE_TOKEN, and MINEFLARE_SETUP_TOKEN in .env.');
}
const app = await alchemy(name, {
  stateStore: process.env.NODE_ENV === 'development' ? (scope: Scope) => new SQLiteStateStore(scope) : stateStore,
  password: process.env.ALCHEMY_PASSWORD,
  stage: name,
});

const container = await Container<MinecraftContainer>('container3', {
  name: `${app.name}-container`, className: 'MinecraftContainer', adopt: true,
  build: { context: '.', dockerfile: 'container_src/Dockerfile' },
  instanceType: 'standard-1', maxInstances: 1,
});
const dataBucket = await R2Bucket('data-private-bucket', {
  name: `${app.name}-private-data`, delete: false,
  dev: { remote: true }, adopt: true, allowPublicAccess: false,
});
const tsAuthkey = await Secret('ts-authkey', { value: alchemy.secret('null') });
const setupToken = await Secret('setup-token', { value: alchemy.secret(process.env.MINEFLARE_SETUP_TOKEN) });
const bindings = {
  MINECRAFT_CONTAINER: container,
  MINEFLARE_SETUP_TOKEN: setupToken,
  TS_AUTHKEY: tsAuthkey,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  MINEFLARE_RESET_PASSWORD_MODE: process.env.MINEFLARE_RESET_PASSWORD_MODE ?? 'false',
  DATA_BUCKET_NAME: dataBucket.name, DATA_BUCKET: dataBucket,
  // Keep upstream proxy binding names without provisioning a public map bucket.
  DYNMAP_BUCKET_NAME: dataBucket.name, DYNMAP_BUCKET: dataBucket, DYNMAP_WORKER_URL: '',
} as const;
export const worker: BunSPA<typeof bindings> = await BunSPA('mineflare-main-worker', {
  name: app.name, entrypoint: 'src/worker.ts', frontend: ['index.html'], adopt: true,
  compatibility: 'node', compatibilityFlags: ['enable_ctx_exports'],
  compatibilityDate: '2025-09-27', bindings,
  assets: { directory: 'dist/client', run_worker_first: ['/play/*'] },
});

// Type-only compatibility for unused upstream sources; no ancillary workers deploy.
export declare const dynmapWorker: Worker<{ DYNMAP_BUCKET: R2Bucket; BUCKET_DOMAIN: string; MINECRAFT_WORKER_URL: string }>;
export declare const agentWorker: Worker;
console.log('Worker URL:', worker.url);
await app.finalize();
