import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, del, get, patch, post, request } from './helpers/http.js';

async function setup(t, options) {
  const server = await startServer(options);
  t.after(() => server.close());
  return server;
}

async function createTask(baseUrl, json) {
  const res = await post(baseUrl, '/tasks', { json });
  assertJsonResponse(res, 201);
  return res.body;
}

async function listTasks(baseUrl) {
  const res = await get(baseUrl, '/tasks');
  assertJsonResponse(res, 200);
  return res.body;
}

test('AC-50: an unknown route or method returns 404 ROUTE_NOT_FOUND', async (t) => {
  const { baseUrl } = await setup(t);
  assertError(await get(baseUrl, '/unknown'), 404, 'ROUTE_NOT_FOUND');
  assertError(await request(baseUrl, 'PUT', '/tasks'), 404, 'ROUTE_NOT_FOUND');
});

test('AC-51: every response is application/json and errors have exactly error and message', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTask(baseUrl, { title: 'Sample' });

  const ok = await get(baseUrl, '/tasks');
  assertJsonResponse(ok, 200);
  const one = await get(baseUrl, `/tasks/${task.id}`);
  assertJsonResponse(one, 200);

  const cases = [
    [await post(baseUrl, '/tasks', { json: { title: '' } }), 400, 'VALIDATION_ERROR'],
    [await get(baseUrl, '/tasks/does-not-exist'), 404, 'TASK_NOT_FOUND'],
    [await patch(baseUrl, `/tasks/${task.id}`, { json: { priority: 'urgent' } }), 400, 'VALIDATION_ERROR'],
    [await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'done' } }), 409, 'INVALID_STATUS_TRANSITION'],
    [await del(baseUrl, '/tasks/does-not-exist'), 404, 'TASK_NOT_FOUND'],
    [await get(baseUrl, '/tasks?sort=name'), 400, 'VALIDATION_ERROR'],
    [await get(baseUrl, '/unknown'), 404, 'ROUTE_NOT_FOUND'],
    [await post(baseUrl, '/tasks', { raw: '{"title":' }), 400, 'INVALID_JSON'],
  ];
  for (const [res, status, code] of cases) {
    assertError(res, status, code);
    assert.equal(typeof res.body.error, 'string');
    assert.ok(res.body.error.length > 0);
    assert.doesNotMatch(res.body.message, /\n {4}at /);
    assert.equal(res.body.message.includes('/src/'), false);
    assert.equal(res.body.message.includes('\\src\\'), false);
  }
});

test('AC-52: a body over 102400 bytes returns 400 VALIDATION_ERROR and changes nothing', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTask(baseUrl, { title: 'Existing' });
  const before = await listTasks(baseUrl);
  const big = 'a'.repeat(102401);

  const created = await post(baseUrl, '/tasks', { raw: big });
  assertError(created, 400, 'VALIDATION_ERROR');
  assert.equal((await listTasks(baseUrl)).length, before.length);

  const patched = await patch(baseUrl, `/tasks/${task.id}`, { raw: big });
  assertError(patched, 400, 'VALIDATION_ERROR');
  assert.deepEqual(await listTasks(baseUrl), before);
});

test('AC-53: a missing task is reported before field validation but after JSON parsing', async (t) => {
  const { baseUrl } = await setup(t);
  const notFound = await patch(baseUrl, '/tasks/does-not-exist', { json: { title: '' } });
  assertError(notFound, 404, 'TASK_NOT_FOUND');
  const badJson = await patch(baseUrl, '/tasks/does-not-exist', { raw: '{"title":' });
  assertError(badJson, 400, 'INVALID_JSON');
});

test('AC-55: query parameters on routes other than GET /tasks return 400 and change nothing', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTask(baseUrl, { title: 'Keep' });
  const before = await listTasks(baseUrl);

  assertError(await post(baseUrl, '/tasks?x=1', { json: { title: 'A' } }), 400, 'VALIDATION_ERROR');
  assertError(await get(baseUrl, `/tasks/${task.id}?x=1`), 400, 'VALIDATION_ERROR');
  assertError(
    await patch(baseUrl, `/tasks/${task.id}?x=1`, { json: { title: 'B' } }),
    400,
    'VALIDATION_ERROR',
  );
  assertError(await del(baseUrl, `/tasks/${task.id}?x=1`), 400, 'VALIDATION_ERROR');

  assert.deepEqual(await listTasks(baseUrl), before);
});

test('AC-56: an id with invalid percent-encoding returns 400 VALIDATION_ERROR, never 500', async (t) => {
  const { baseUrl } = await setup(t);
  const bad = '/tasks/%E0%A4';
  assertError(await get(baseUrl, bad), 400, 'VALIDATION_ERROR');
  assertError(await patch(baseUrl, bad, { json: { title: 'A' } }), 400, 'VALIDATION_ERROR');
  assertError(await del(baseUrl, bad), 400, 'VALIDATION_ERROR');
});

test('AC-57: a failed save returns 500 INTERNAL_ERROR, keeps memory unchanged, and the server recovers', async (t) => {
  const dir = await makeTempDir();
  const blocked = path.join(dir, 'blocked');
  const { baseUrl } = await setup(t, { dataFile: path.join(blocked, 'tasks.json') });

  await fs.writeFile(blocked, '');
  const failed = await post(baseUrl, '/tasks', { json: { title: 'A' } });
  assertError(failed, 500, 'INTERNAL_ERROR');
  assert.deepEqual(await listTasks(baseUrl), []);

  await fs.rm(blocked);
  const ok = await post(baseUrl, '/tasks', { json: { title: 'B' } });
  assertJsonResponse(ok, 201);
  const after = await listTasks(baseUrl);
  assert.equal(after.length, 1);
  assert.equal(after[0].title, 'B');
});

test('AC-59: an empty body on POST or PATCH returns 400 INVALID_JSON and changes nothing', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTask(baseUrl, { title: 'Stay' });
  const before = await listTasks(baseUrl);

  assertError(await post(baseUrl, '/tasks', { raw: '' }), 400, 'INVALID_JSON');
  assertError(await patch(baseUrl, `/tasks/${task.id}`, { raw: '' }), 400, 'INVALID_JSON');

  assert.deepEqual(await listTasks(baseUrl), before);
});

test('AC-60: HEAD, OPTIONS and a trailing slash are not routes', async (t) => {
  const { baseUrl } = await setup(t);
  const head = await request(baseUrl, 'HEAD', '/tasks');
  assert.equal(head.status, 404);
  assertError(await request(baseUrl, 'OPTIONS', '/tasks'), 404, 'ROUTE_NOT_FOUND');
  assertError(await get(baseUrl, '/tasks/'), 404, 'ROUTE_NOT_FOUND');
});

test('AC-63: an id over 100 characters returns 400, 100 characters is looked up normally', async (t) => {
  const { baseUrl } = await setup(t);
  const tooLong = `/tasks/${'a'.repeat(101)}`;
  assertError(await get(baseUrl, tooLong), 400, 'VALIDATION_ERROR');
  assertError(await patch(baseUrl, tooLong, { json: { title: 'A' } }), 400, 'VALIDATION_ERROR');
  assertError(await del(baseUrl, tooLong), 400, 'VALIDATION_ERROR');
  assertError(await get(baseUrl, `/tasks/${'a'.repeat(100)}`), 404, 'TASK_NOT_FOUND');
});
