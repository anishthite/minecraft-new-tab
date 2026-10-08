import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('both snapshot paths exclude mutable logs and disposable cache, not world data', () => {
  const root = mkdtempSync(join(tmpdir(), 'minecraft-backup-'));
  try {
    for (const dir of ['logs', 'cache', 'world']) {
      mkdirSync(join(root, 'data', dir), { recursive: true });
      writeFileSync(join(root, 'data', dir, 'sentinel'), dir);
    }
    const source = readFileSync(new URL('../docker_src/file-server.ts', import.meta.url), 'utf8');
    const calls = [...source.matchAll(/const tarProc = spawn\(\[([\s\S]*?)\]\);/g)].filter(call => call[1].includes('"-czf"'));
    assert.equal(calls.length, 2);
    for (const [index, call] of calls.entries()) {
      const archive = join(root, `backup-${index}.tar.gz`);
      const args = new Function('tempFile', 'dirName', 'directory', `return [${call[1]}]`)(archive, 'data', join(root, 'data'));
      execFileSync(args[0], args.slice(1));
      const files = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' });
      assert.match(files, /data\/world\/sentinel/);
      assert.doesNotMatch(files, /data\/(logs|cache)/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
