import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, get, post } from './helpers/http.js';

async function setup(t) {
  const server = await startServer();
  t.after(() => server.close());
  return server;
}

test('AC-17: GET /tasks on an empty store returns 200 []', async (t) => {
  const { baseUrl } = await setup(t);
  const res = await get(baseUrl, '/tasks');
  assertJsonResponse(res, 200);
  assert.deepEqual(res.body, []);
});

test('AC-18: list keeps creation order and GET by id returns the created task', async (t) => {
  const { baseUrl } = await setup(t);
  const created = [];
  for (const title of ['A', 'B', 'C']) {
    const res = await post(baseUrl, '/tasks', { json: { title } });
    assertJsonResponse(res, 201);
    created.push(res.body);
  }
  const list = await get(baseUrl, '/tasks');
  assertJsonResponse(list, 200);
  assert.equal(list.body.length, 3);
  assert.deepEqual(list.body.map((t) => t.title), ['A', 'B', 'C']);
  const one = await get(baseUrl, `/tasks/${created[1].id}`);
  assertJsonResponse(one, 200);
  assert.deepEqual(one.body, created[1]);
});

test('AC-19: GET /tasks/{unknown id} returns 404 TASK_NOT_FOUND', async (t) => {
  const { baseUrl } = await setup(t);
  const res = await get(baseUrl, '/tasks/does-not-exist');
  assertError(res, 404, 'TASK_NOT_FOUND');
});
