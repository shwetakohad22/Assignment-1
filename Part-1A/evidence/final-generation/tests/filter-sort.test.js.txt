import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, get, post } from './helpers/http.js';

async function setup(t) {
  const server = await startServer();
  t.after(() => server.close());
  return server;
}

async function createAll(baseUrl, tasks) {
  for (const json of tasks) {
    const res = await post(baseUrl, '/tasks', { json });
    assertJsonResponse(res, 201);
  }
}

async function titlesFor(baseUrl, path) {
  const res = await get(baseUrl, path);
  assertJsonResponse(res, 200);
  return res.body.map((task) => task.title);
}

const TAGGED = [
  { title: 'T1', tags: ['home'] },
  { title: 'T2', tags: ['work'] },
  { title: 'T3', tags: ['home', 'urgent'] },
];

test('AC-38: ?tag=home returns only tasks with that tag in creation order', async (t) => {
  const { baseUrl } = await setup(t);
  await createAll(baseUrl, TAGGED);
  assert.deepEqual(await titlesFor(baseUrl, '/tasks?tag=home'), ['T1', 'T3']);
});

test('AC-39: a tag no task has returns 200 []', async (t) => {
  const { baseUrl } = await setup(t);
  await createAll(baseUrl, TAGGED);
  assert.deepEqual(await titlesFor(baseUrl, '/tasks?tag=garden'), []);
});

test('AC-40: the tag filter is case-insensitive', async (t) => {
  const { baseUrl } = await setup(t);
  await createAll(baseUrl, TAGGED);
  assert.deepEqual(await titlesFor(baseUrl, '/tasks?tag=Home'), ['T1', 'T3']);
});

test('AC-41: an empty tag returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  const res = await get(baseUrl, '/tasks?tag=');
  assertError(res, 400, 'VALIDATION_ERROR');
});

test('AC-42: ?sort=priority orders high, medium, low and keeps ties in creation order', async (t) => {
  const { baseUrl } = await setup(t);
  await createAll(baseUrl, [
    { title: 'L1', priority: 'low' },
    { title: 'H1', priority: 'high' },
    { title: 'M1', priority: 'medium' },
    { title: 'H2', priority: 'high' },
    { title: 'L2', priority: 'low' },
  ]);
  assert.deepEqual(await titlesFor(baseUrl, '/tasks?sort=priority'), ['H1', 'H2', 'M1', 'L1', 'L2']);
  assert.deepEqual(await titlesFor(baseUrl, '/tasks'), ['L1', 'H1', 'M1', 'H2', 'L2']);
});

test('AC-43: an unknown sort value returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  const res = await get(baseUrl, '/tasks?sort=name');
  assertError(res, 400, 'VALIDATION_ERROR');
});

test('AC-44: tag filter and priority sort combine', async (t) => {
  const { baseUrl } = await setup(t);
  await createAll(baseUrl, [
    { title: 'A', priority: 'low', tags: ['home'] },
    { title: 'B', priority: 'high', tags: ['work'] },
    { title: 'C', priority: 'high', tags: ['home'] },
    { title: 'D', priority: 'medium', tags: ['home'] },
  ]);
  assert.deepEqual(await titlesFor(baseUrl, '/tasks?tag=home&sort=priority'), ['C', 'D', 'A']);
});

test('AC-58: unknown or repeated query parameters return 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  for (const query of ['?foo=1', '?tag=home&tag=work', '?sort=priority&sort=priority']) {
    const res = await get(baseUrl, `/tasks${query}`);
    assertError(res, 400, 'VALIDATION_ERROR');
  }
});

test('AC-61: a tag filter over 50 characters returns 400, 50 characters returns 200', async (t) => {
  const { baseUrl } = await setup(t);
  const tooLong = await get(baseUrl, `/tasks?tag=${'a'.repeat(51)}`);
  assertError(tooLong, 400, 'VALIDATION_ERROR');
  const ok = await get(baseUrl, `/tasks?tag=${'a'.repeat(50)}`);
  assertJsonResponse(ok, 200);
  assert.deepEqual(ok.body, []);
});
