import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, get, patch, post } from './helpers/http.js';

// Allowed steps used to reach each starting status.
const PATH_TO = {
  todo: [],
  'in-progress': ['in-progress'],
  done: ['in-progress', 'done'],
};

async function setup(t) {
  const server = await startServer();
  t.after(() => server.close());
  return server;
}

async function createTaskIn(baseUrl, status, title = 'Task') {
  const created = await post(baseUrl, '/tasks', { json: { title } });
  assertJsonResponse(created, 201);
  for (const step of PATH_TO[status]) {
    const res = await patch(baseUrl, `/tasks/${created.body.id}`, { json: { status: step } });
    assertJsonResponse(res, 200);
  }
  return created.body;
}

async function assertStoredStatus(baseUrl, id, status) {
  const res = await get(baseUrl, `/tasks/${id}`);
  assertJsonResponse(res, 200);
  assert.equal(res.body.status, status);
}

test('AC-28: todo → in-progress returns 200', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTaskIn(baseUrl, 'todo');
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'in-progress' } });
  assertJsonResponse(res, 200);
  assert.equal(res.body.status, 'in-progress');
  await assertStoredStatus(baseUrl, task.id, 'in-progress');
});

test('AC-29: in-progress → done returns 200', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTaskIn(baseUrl, 'in-progress');
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'done' } });
  assertJsonResponse(res, 200);
  assert.equal(res.body.status, 'done');
  await assertStoredStatus(baseUrl, task.id, 'done');
});

test('AC-30: in-progress → todo returns 200', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTaskIn(baseUrl, 'in-progress');
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'todo' } });
  assertJsonResponse(res, 200);
  assert.equal(res.body.status, 'todo');
  await assertStoredStatus(baseUrl, task.id, 'todo');
});

test('AC-31: todo → done returns 409 and keeps status', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTaskIn(baseUrl, 'todo');
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'done' } });
  assertError(res, 409, 'INVALID_STATUS_TRANSITION');
  await assertStoredStatus(baseUrl, task.id, 'todo');
});

test('AC-32: done → in-progress returns 409 and keeps status', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTaskIn(baseUrl, 'done');
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'in-progress' } });
  assertError(res, 409, 'INVALID_STATUS_TRANSITION');
  await assertStoredStatus(baseUrl, task.id, 'done');
});

test('AC-33: done → todo returns 409 and keeps status', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTaskIn(baseUrl, 'done');
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'todo' } });
  assertError(res, 409, 'INVALID_STATUS_TRANSITION');
  await assertStoredStatus(baseUrl, task.id, 'done');
});

test('AC-34: changing to the same status returns 409 for every status', async (t) => {
  const { baseUrl } = await setup(t);
  for (const status of ['todo', 'in-progress', 'done']) {
    const task = await createTaskIn(baseUrl, status);
    const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status } });
    assertError(res, 409, 'INVALID_STATUS_TRANSITION');
    await assertStoredStatus(baseUrl, task.id, status);
  }
});

test('AC-35: a valid title change with a disallowed status change is rejected as a whole', async (t) => {
  const { baseUrl } = await setup(t);
  const task = await createTaskIn(baseUrl, 'todo', 'Old');
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { title: 'New', status: 'done' } });
  assertError(res, 409, 'INVALID_STATUS_TRANSITION');
  const after = await get(baseUrl, `/tasks/${task.id}`);
  assertJsonResponse(after, 200);
  assert.equal(after.body.title, 'Old');
  assert.equal(after.body.status, 'todo');
});
