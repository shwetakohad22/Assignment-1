import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

test('loadConfig uses defaults when nothing is set', () => {
  const config = loadConfig({});
  assert.equal(config.port, 3000);
  assert.equal(config.host, '127.0.0.1');
  assert.ok(path.isAbsolute(config.dataFile));
  assert.match(config.dataFile, /data[\\/]tasks\.json$/);
});

test('loadConfig accepts PORT 0 and 65535', () => {
  assert.equal(loadConfig({ PORT: '0' }).port, 0);
  assert.equal(loadConfig({ PORT: '65535' }).port, 65535);
});

for (const bad of ['abc', '-1', '65536', '3.5', '']) {
  test(`loadConfig rejects PORT=${JSON.stringify(bad)}`, () => {
    assert.throws(() => loadConfig({ PORT: bad }), /Invalid PORT/);
  });
}

test('loadConfig rejects a blank HOST', () => {
  assert.throws(() => loadConfig({ HOST: '  ' }), /Invalid HOST/);
});

test('loadConfig rejects an empty DATA_FILE', () => {
  assert.throws(() => loadConfig({ DATA_FILE: '' }), /Invalid DATA_FILE/);
});

test('loadConfig resolves a relative DATA_FILE against the current directory', () => {
  assert.equal(
    loadConfig({ DATA_FILE: 'some/dir/tasks.json' }).dataFile,
    path.resolve(process.cwd(), 'some/dir/tasks.json'),
  );
});
