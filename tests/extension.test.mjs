import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/newtab.js', import.meta.url), 'utf8');
function launcher(saved, search = '') {
  const input = { value: '' }, error = { textContent: '' };
  let submit, redirected, stored;
  const context = {
    URL,
    document: { querySelector: selector => selector === 'form' ? { addEventListener: (_, handler) => { submit = handler; } } : selector === '#dashboard' ? input : error },
    location: { search, replace: value => { redirected = value; } },
    chrome: { storage: { local: { get: async () => ({ dashboard: saved }), set: async value => { stored = value; } } } },
  };
  vm.runInNewContext(source, context);
  return { input, error, submit: () => submit({ preventDefault() {} }), redirected: () => redirected, stored: () => stored };
}

test('new-tab launcher redirects saved URLs but keeps configuration accessible', async () => {
  const tab = launcher('https://minecraft.example/');
  await Promise.resolve();
  assert.equal(tab.redirected(), 'https://minecraft.example/');
  const options = launcher('https://minecraft.example/', '?configure');
  await Promise.resolve();
  assert.equal(options.redirected(), undefined);
  assert.equal(options.input.value, 'https://minecraft.example/');
});

test('launcher rejects unsafe URLs and accepts loopback development', async () => {
  const page = launcher();
  await Promise.resolve();
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:secret@example.com']) {
    page.input.value = url;
    await page.submit();
    assert.equal(page.redirected(), undefined);
    assert.equal(page.stored(), undefined);
    assert.ok(page.error.textContent);
  }
  page.input.value = 'http://127.0.0.1:8081/play/';
  await page.submit();
  assert.equal(page.redirected(), 'http://127.0.0.1:8081/play/');
});
