import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, del, get, post } from './helpers/http.js';

async function setup(t) {
  const server = await startServer();
  t.after(() => server.close());
  return server;
}

test('AC-36: DELETE returns 204 with no body and the task is gone', async (t) => {
  const { baseUrl } = await setup(t);
  const created = await post(baseUrl, '/tasks', { json: { title: 'Remove me' } });
  assertJsonResponse(created, 201);
  const res = await del(baseUrl, `/tasks/${created.body.id}`);
  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  assert.equal(res.headers.get('content-type'), null);
  const one = await get(baseUrl, `/tasks/${created.body.id}`);
  assertError(one, 404, 'TASK_NOT_FOUND');
  const list = await get(baseUrl, '/tasks');
  assertJsonResponse(list, 200);
  assert.equal(list.body.some((t) => t.id === created.body.id), false);
});

test('AC-37: DELETE an unknown or already deleted id returns 404 TASK_NOT_FOUND', async (t) => {
  const { baseUrl } = await setup(t);
  const unknown = await del(baseUrl, '/tasks/does-not-exist');
  assertError(unknown, 404, 'TASK_NOT_FOUND');
  const created = await post(baseUrl, '/tasks', { json: { title: 'Twice' } });
  assertJsonResponse(created, 201);
  const first = await del(baseUrl, `/tasks/${created.body.id}`);
  assert.equal(first.status, 204);
  const second = await del(baseUrl, `/tasks/${created.body.id}`);
  assertError(second, 404, 'TASK_NOT_FOUND');
});
