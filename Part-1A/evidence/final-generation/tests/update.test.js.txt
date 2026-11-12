import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, get, patch, post } from './helpers/http.js';

async function setup(t) {
  const server = await startServer();
  t.after(() => server.close());
  const created = await post(server.baseUrl, '/tasks', {
    json: { title: 'Old title', priority: 'high', tags: ['home'] },
  });
  assertJsonResponse(created, 201);
  return { ...server, task: created.body };
}

async function assertUnchanged(baseUrl, task) {
  const res = await get(baseUrl, `/tasks/${task.id}`);
  assertJsonResponse(res, 200);
  assert.deepEqual(res.body, task);
}

test('AC-20: PATCH title returns 200 with the new title and keeps id and createdAt', async (t) => {
  const { baseUrl, task } = await setup(t);
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { title: 'New title' } });
  assertJsonResponse(res, 200);
  assert.equal(res.body.title, 'New title');
  assert.equal(res.body.id, task.id);
  assert.equal(res.body.createdAt, task.createdAt);
  const after = await get(baseUrl, `/tasks/${task.id}`);
  assertJsonResponse(after, 200);
  assert.equal(after.body.title, 'New title');
});

test('AC-21: PATCH priority and tags changes only those fields', async (t) => {
  const { baseUrl, task } = await setup(t);
  const res = await patch(baseUrl, `/tasks/${task.id}`, {
    json: { priority: 'low', tags: ['work'] },
  });
  assertJsonResponse(res, 200);
  assert.equal(res.body.priority, 'low');
  assert.deepEqual(res.body.tags, ['work']);
  assert.equal(res.body.title, task.title);
  assert.equal(res.body.status, task.status);
  assert.equal(res.body.id, task.id);
  assert.equal(res.body.createdAt, task.createdAt);
});

test('AC-22: PATCH with an empty title returns 400 and keeps the old title', async (t) => {
  const { baseUrl, task } = await setup(t);
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { title: '' } });
  assertError(res, 400, 'VALIDATION_ERROR');
  await assertUnchanged(baseUrl, task);
});

test('AC-23: PATCH with an invalid priority returns 400', async (t) => {
  const { baseUrl, task } = await setup(t);
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { priority: 'urgent' } });
  assertError(res, 400, 'VALIDATION_ERROR');
  await assertUnchanged(baseUrl, task);
});

test('AC-24: PATCH with an empty object returns 400', async (t) => {
  const { baseUrl, task } = await setup(t);
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: {} });
  assertError(res, 400, 'VALIDATION_ERROR');
  await assertUnchanged(baseUrl, task);
});

test('AC-25: PATCH with id, createdAt or an unknown key returns 400 and changes nothing', async (t) => {
  const { baseUrl, task } = await setup(t);
  for (const body of [{ id: 'x' }, { createdAt: '2020-01-01T00:00:00Z' }, { color: 'red' }]) {
    const res = await patch(baseUrl, `/tasks/${task.id}`, { json: body });
    assertError(res, 400, 'VALIDATION_ERROR');
    await assertUnchanged(baseUrl, task);
  }
});

test('AC-26: PATCH an unknown id returns 404 TASK_NOT_FOUND', async (t) => {
  const { baseUrl } = await setup(t);
  const res = await patch(baseUrl, '/tasks/does-not-exist', { json: { title: 'X' } });
  assertError(res, 404, 'TASK_NOT_FOUND');
});

test('AC-27: PATCH with an unknown status value returns 400, not 409', async (t) => {
  const { baseUrl, task } = await setup(t);
  const res = await patch(baseUrl, `/tasks/${task.id}`, { json: { status: 'archived' } });
  assertError(res, 400, 'VALIDATION_ERROR');
  await assertUnchanged(baseUrl, task);
});
