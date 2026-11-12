import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, startProcess } from './helpers/server.js';
import { assertJsonResponse, get, post } from './helpers/http.js';

test('AC-54: 20 simultaneous creates are all saved and survive a restart', async (t) => {
  const dir = await makeTempDir();
  const dataFile = path.join(dir, 'tasks.json');
  const first = await startProcess({ dataFile });
  t.after(() => first.stop());

  const titles = Array.from({ length: 20 }, (_, i) => `T${i + 1}`);
  const pending = titles.map((title) => post(first.baseUrl, '/tasks', { json: { title } }));
  const responses = await Promise.all(pending);
  for (const res of responses) {
    assertJsonResponse(res, 201);
  }

  const list = await get(first.baseUrl, '/tasks');
  assertJsonResponse(list, 200);
  assert.equal(list.body.length, 20);
  assert.equal(new Set(list.body.map((task) => task.id)).size, 20);
  assert.deepEqual(new Set(list.body.map((task) => task.title)), new Set(titles));

  const onDisk = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.ok(Array.isArray(onDisk));
  assert.equal(onDisk.length, 20);

  await first.stop();
  const second = await startProcess({ dataFile });
  t.after(() => second.stop());
  const after = await get(second.baseUrl, '/tasks');
  assertJsonResponse(after, 200);
  assert.deepEqual(after.body, list.body);

  const leftovers = (await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});
