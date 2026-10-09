import { test, expect, mock } from 'bun:test';

const effects: { run: () => unknown; deps: unknown[] }[] = [];
let starts = 0;
mock.module('preact/hooks', () => ({
  useState: (value: unknown) => [value, () => {}],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (run: () => unknown, deps: unknown[]) => effects.push({ run, deps }),
}));
mock.module('../src/client/utils/api', () => ({
  fetchWithAuth: async (path: string) => {
    if (path === '/api/start') starts++;
    return Response.json({ status: 'stopped', plugins: [] });
  },
}));
const { useServerData } = await import('../src/client/hooks/useServerData');

test('auto-start is auth-gated and cannot depend on polling or stopped state', async () => {
  for (const authenticated of [false, true]) {
    effects.length = 0;
    useServerData(authenticated);
    const entry = effects.find(effect => effect.deps.length === 1);
    expect(entry?.deps).toEqual([authenticated]);
    entry!.run();
    await Bun.sleep(0);
    expect(starts).toBe(authenticated ? 1 : 0);
  }
});
