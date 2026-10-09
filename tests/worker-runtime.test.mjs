import test from 'node:test';
import assert from 'node:assert/strict';
import { Elysia, t } from 'elysia';
import { WebStandardAdapter } from 'elysia/adapter/web-standard';

test('Worker routes validate input and handle failures without request-time eval', async () => {
  const routes = new Elysia({ adapter: WebStandardAdapter, aot: false })
    .post('/login', () => ({ success: true }), { body: t.Object({ password: t.String() }) })
    .get('/failure', () => { throw new Error('transport failure'); });
  const app = new Elysia({ adapter: WebStandardAdapter, aot: false })
    .group('/auth', (group) => group.use(routes)).compile();
  const original = globalThis.Function;
  globalThis.Function = function () { throw new Error('Worker prohibits dynamic code'); };
  try {
    const login = (body) => app.handle(new Request('https://example.test/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal((await login({ password: 'test' })).status, 200);
    assert.equal((await login({})).status, 422);
    const failure = await app.handle(new Request('https://example.test/auth/failure'));
    assert.equal(failure.status, 500);
    assert.match(await failure.text(), /transport failure/);
  } finally { globalThis.Function = original; }
});
