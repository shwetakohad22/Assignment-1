import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';
import { assertError, assertJsonResponse, get, post } from './helpers/http.js';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TASK_KEYS = ['id', 'title', 'status', 'priority', 'tags', 'createdAt'];

async function setup(t) {
  const server = await startServer();
  t.after(() => server.close());
  return server;
}

const distinctTags = (n) => Array.from({ length: n }, (_, i) => `tag${i}`);

// Every rejected create body from AC-04 – AC-15 with its expected error code.
const REJECTED = [
  { ac: 'AC-04', options: { json: { title: '' } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-05', options: { json: { title: '   ' } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-06', options: { json: {} }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-07', options: { json: { title: 123 } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-08', options: { json: { title: 'x'.repeat(201) } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-09', options: { json: { title: 'A', priority: 'urgent' } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-10', options: { json: { title: 'A', tags: 'home' } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-11', options: { json: { title: 'A', tags: [1] } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-11', options: { json: { title: 'A', tags: [''] } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-11', options: { json: { title: 'A', tags: ['x'.repeat(51)] } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-11', options: { json: { title: 'A', tags: distinctTags(21) } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-12', options: { raw: '{"title":' }, code: 'INVALID_JSON' },
  { ac: 'AC-13', options: { raw: '["Buy milk"]' }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-13', options: { raw: 'null' }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-14', options: { json: { title: 'A', id: 'x' } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-14', options: { json: { title: 'A', createdAt: '2020-01-01T00:00:00.000Z' } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-14', options: { json: { title: 'A', color: 'red' } }, code: 'VALIDATION_ERROR' },
  { ac: 'AC-15', options: { json: { title: 'A', status: 'done' } }, code: 'VALIDATION_ERROR' },
];

function rejectedFor(ac) {
  return REJECTED.filter((r) => r.ac === ac);
}

async function assertAllRejected(baseUrl, ac) {
  for (const { options, code } of rejectedFor(ac)) {
    const res = await post(baseUrl, '/tasks', options);
    assertError(res, 400, code);
  }
}

test('AC-01: create with only a title returns 201 with defaults', async (t) => {
  const { baseUrl } = await setup(t);
  const res = await post(baseUrl, '/tasks', { json: { title: 'Buy milk' } });
  assertJsonResponse(res, 201);
  const task = res.body;
  assert.deepEqual(Object.keys(task), TASK_KEYS);
  assert.equal(typeof task.id, 'string');
  assert.ok(task.id.length > 0);
  assert.equal(task.title, 'Buy milk');
  assert.equal(task.status, 'todo');
  assert.equal(task.priority, 'medium');
  assert.deepEqual(task.tags, []);
  assert.match(task.createdAt, ISO_UTC);
  assert.equal(new Date(task.createdAt).toISOString(), task.createdAt);
});

test('AC-02: create with priority and tags normalizes tags', async (t) => {
  const { baseUrl } = await setup(t);
  const res = await post(baseUrl, '/tasks', {
    json: { title: 'Clean', priority: 'high', tags: ['Home', 'urgent', 'home'] },
  });
  assertJsonResponse(res, 201);
  assert.equal(res.body.priority, 'high');
  assert.deepEqual(res.body.tags, ['home', 'urgent']);
});

test('AC-03: title is trimmed and two creates get different ids', async (t) => {
  const { baseUrl } = await setup(t);
  const first = await post(baseUrl, '/tasks', { json: { title: '  Pay rent  ' } });
  assertJsonResponse(first, 201);
  assert.equal(first.body.title, 'Pay rent');
  const second = await post(baseUrl, '/tasks', { json: { title: 'Pay rent' } });
  assertJsonResponse(second, 201);
  assert.notEqual(first.body.id, second.body.id);
});

test('AC-04: empty title returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-04');
});

test('AC-05: whitespace-only title returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-05');
});

test('AC-06: missing title returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-06');
});

test('AC-07: non-string title returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-07');
});

test('AC-08: 201-character title returns 400, 200 characters returns 201', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-08');
  const ok = await post(baseUrl, '/tasks', { json: { title: 'x'.repeat(200) } });
  assertJsonResponse(ok, 201);
  assert.equal(ok.body.title, 'x'.repeat(200));
});

test('AC-09: invalid priority returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-09');
});

test('AC-10: tags that are not an array return 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-10');
});

test('AC-11: invalid tag items or more than 20 tags return 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  assert.equal(rejectedFor('AC-11').length, 4);
  await assertAllRejected(baseUrl, 'AC-11');
});

test('AC-12: malformed JSON returns 400 INVALID_JSON', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-12');
});

test('AC-13: array or null body returns 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-13');
});

test('AC-14: id, createdAt or unknown keys return 400 VALIDATION_ERROR', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-14');
});

test('AC-15: status other than todo on create returns 400, status todo returns 201', async (t) => {
  const { baseUrl } = await setup(t);
  await assertAllRejected(baseUrl, 'AC-15');
  const ok = await post(baseUrl, '/tasks', { json: { title: 'A', status: 'todo' } });
  assertJsonResponse(ok, 201);
  assert.equal(ok.body.status, 'todo');
});

test('AC-16: no rejected create changes the task list', async (t) => {
  const { baseUrl } = await setup(t);
  const seeded = await post(baseUrl, '/tasks', { json: { title: 'Seed' } });
  assertJsonResponse(seeded, 201);
  for (const { ac, options, code } of REJECTED) {
    const before = await get(baseUrl, '/tasks');
    assertJsonResponse(before, 200);
    const res = await post(baseUrl, '/tasks', options);
    assertError(res, 400, code);
    const after = await get(baseUrl, '/tasks');
    assertJsonResponse(after, 200);
    assert.equal(after.body.length, before.body.length, `list length changed after ${ac}`);
  }
});
