import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, runProcessToExit, startProcess, startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, del, get, patch, post } from './helpers/http.js';

async function exists(file) {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

async function tempDataFile() {
  return path.join(await makeTempDir(), 'tasks.json');
}

test('AC-45: tasks and their changes are identical after a restart', async (t) => {
  const dataFile = await tempDataFile();
  const first = await startProcess({ dataFile });
  t.after(() => first.stop());
  const ids = [];
  for (const title of ['One', 'Two', 'Three']) {
    const res = await post(first.baseUrl, '/tasks', { json: { title } });
    assertJsonResponse(res, 201);
    ids.push(res.body.id);
  }
  const changed = await patch(first.baseUrl, `/tasks/${ids[1]}`, {
    json: { title: 'Two edited', priority: 'high', tags: ['Work'], status: 'in-progress' },
  });
  assertJsonResponse(changed, 200);
  const before = await get(first.baseUrl, '/tasks');
  assertJsonResponse(before, 200);
  await first.stop();

  const second = await startProcess({ dataFile });
  t.after(() => second.stop());
  const after = await get(second.baseUrl, '/tasks');
  assertJsonResponse(after, 200);
  assert.deepEqual(after.body, before.body);
});

test('AC-46: a deleted task is still gone after a restart', async (t) => {
  const dataFile = await tempDataFile();
  const first = await startProcess({ dataFile });
  t.after(() => first.stop());
  const keep = await post(first.baseUrl, '/tasks', { json: { title: 'Keep' } });
  assertJsonResponse(keep, 201);
  const gone = await post(first.baseUrl, '/tasks', { json: { title: 'Gone' } });
  assertJsonResponse(gone, 201);
  const deleted = await del(first.baseUrl, `/tasks/${gone.body.id}`);
  assert.equal(deleted.status, 204);
  await first.stop();

  const second = await startProcess({ dataFile });
  t.after(() => second.stop());
  const res = await get(second.baseUrl, `/tasks/${gone.body.id}`);
  assertError(res, 404, 'TASK_NOT_FOUND');
  const kept = await get(second.baseUrl, `/tasks/${keep.body.id}`);
  assertJsonResponse(kept, 200);
});

test('AC-47: a missing data file starts with an empty list and is not created', async (t) => {
  const dataFile = await tempDataFile();
  const server = await startProcess({ dataFile });
  t.after(() => server.stop());
  const res = await get(server.baseUrl, '/tasks');
  assertJsonResponse(res, 200);
  assert.deepEqual(res.body, []);
  assert.equal(await exists(dataFile), false);
});

test('AC-48: rejected requests leave the data file byte-for-byte unchanged', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { baseUrl, dataFile } = server;
  const seeded = await post(baseUrl, '/tasks', { json: { title: 'Seed', tags: ['home'] } });
  assertJsonResponse(seeded, 201);
  const id = seeded.body.id;

  const rejected = [
    { ac: 'AC-04', send: () => post(baseUrl, '/tasks', { json: { title: '' } }), status: 400, code: 'VALIDATION_ERROR' },
    { ac: 'AC-19', send: () => get(baseUrl, '/tasks/does-not-exist'), status: 404, code: 'TASK_NOT_FOUND' },
    { ac: 'AC-22', send: () => patch(baseUrl, `/tasks/${id}`, { json: { title: '' } }), status: 400, code: 'VALIDATION_ERROR' },
    { ac: 'AC-26', send: () => patch(baseUrl, '/tasks/does-not-exist', { json: { title: 'X' } }), status: 404, code: 'TASK_NOT_FOUND' },
    { ac: 'AC-31', send: () => patch(baseUrl, `/tasks/${id}`, { json: { status: 'done' } }), status: 409, code: 'INVALID_STATUS_TRANSITION' },
    { ac: 'AC-37', send: () => del(baseUrl, '/tasks/does-not-exist'), status: 404, code: 'TASK_NOT_FOUND' },
  ];

  for (const { ac, send, status, code } of rejected) {
    const before = await fs.readFile(dataFile);
    const res = await send();
    assertError(res, status, code);
    const after = await fs.readFile(dataFile);
    assert.deepEqual(after, before, `data file changed after ${ac}`);
  }
});

test('AC-49: a corrupt data file stops startup and is left unchanged', async () => {
  const dataFile = await tempDataFile();
  await fs.writeFile(dataFile, 'not json');
  const { code, stderr } = await runProcessToExit({ dataFile });
  assert.notEqual(code, 0);
  assert.match(stderr, /Failed to start/);
  assert.equal(await fs.readFile(dataFile, 'utf8'), 'not json');
});

test('AC-62: an invalid PORT stops startup and writes nothing', async () => {
  const dataFile = await tempDataFile();
  const { code, stderr } = await runProcessToExit({ dataFile, env: { PORT: 'abc' } });
  assert.notEqual(code, 0);
  assert.match(stderr, /^Failed to start/m);
  assert.equal(await exists(dataFile), false);
});
