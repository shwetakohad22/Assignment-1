import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/errors.js';
import {
  assertTransition,
  isPlainObject,
  isValidStoredTask,
  normalizeTags,
  parseListQuery,
  sortByPriority,
  validateCreate,
  validatePatch,
  validateTitle,
} from '../src/tasks.js';

function assertApi400(fn) {
  assert.throws(fn, (err) => err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION_ERROR');
}

const validTask = () => ({
  id: 'abc',
  title: 'Buy milk',
  status: 'todo',
  priority: 'medium',
  tags: ['home'],
  createdAt: '2026-11-10T09:30:00.000Z',
});

test('normalizeTags lowercases and dedupes keeping first-seen order', () => {
  assert.deepEqual(normalizeTags(['Home', 'urgent', 'home']), ['home', 'urgent']);
});

test('normalizeTags trims and lowercases', () => {
  assert.deepEqual(normalizeTags([' Work ']), ['work']);
});

test('normalizeTags rejects 21 input tags even when duplicates would reduce the count', () => {
  const tags = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 'a' : 'A'));
  assertApi400(() => normalizeTags(tags));
});

test('normalizeTags rejects invalid values', () => {
  assertApi400(() => normalizeTags([1]));
  assertApi400(() => normalizeTags(['']));
  assertApi400(() => normalizeTags(['x'.repeat(51)]));
  assertApi400(() => normalizeTags('home'));
  assertApi400(() => normalizeTags(null));
});

test('validateTitle trims the title', () => {
  assert.equal(validateTitle('  Pay rent  '), 'Pay rent');
});

test('validateTitle accepts 200 characters and rejects 201', () => {
  assert.equal(validateTitle('x'.repeat(200)), 'x'.repeat(200));
  assertApi400(() => validateTitle('x'.repeat(201)));
});

test('validateTitle counts an emoji as one code point', () => {
  const title = '😀'.repeat(200);
  assert.equal(validateTitle(title), title);
  assertApi400(() => validateTitle('😀'.repeat(201)));
});

test('isPlainObject is false for null, arrays and strings', () => {
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject('x'), false);
  assert.equal(isPlainObject({}), true);
});

test('isValidStoredTask accepts a valid task', () => {
  assert.equal(isValidStoredTask(validTask()), true);
});

test('isValidStoredTask rejects an extra key', () => {
  assert.equal(isValidStoredTask({ ...validTask(), color: 'red' }), false);
});

test('isValidStoredTask rejects a missing key', () => {
  const t = validTask();
  delete t.tags;
  assert.equal(isValidStoredTask(t), false);
});

test('isValidStoredTask rejects an uppercase tag', () => {
  assert.equal(isValidStoredTask({ ...validTask(), tags: ['Home'] }), false);
});

test('isValidStoredTask rejects a bad createdAt', () => {
  assert.equal(isValidStoredTask({ ...validTask(), createdAt: '2026-11-10T09:30:00Z' }), false);
  assert.equal(isValidStoredTask({ ...validTask(), createdAt: '2026-02-30T09:30:00.000Z' }), false);
});

test('validateCreate applies defaults', () => {
  assert.deepEqual(validateCreate({ title: ' A ' }), { title: 'A', priority: 'medium', tags: [] });
});

test('validateCreate accepts status todo', () => {
  assert.deepEqual(validateCreate({ title: 'A', status: 'todo' }), {
    title: 'A',
    priority: 'medium',
    tags: [],
  });
});

test('validateCreate rejects status in-progress with 400', () => {
  assertApi400(() => validateCreate({ title: 'A', status: 'in-progress' }));
});

test('validateCreate rejects priority null with 400', () => {
  assertApi400(() => validateCreate({ title: 'A', priority: null }));
});

test('validateCreate rejects an extra key with 400', () => {
  assertApi400(() => validateCreate({ title: 'A', color: 'red' }));
});

test('assertTransition allows exactly the 3 lifecycle steps and rejects the other 6 with 409', () => {
  const statuses = ['todo', 'in-progress', 'done'];
  const allowed = new Set(['todo>in-progress', 'in-progress>done', 'in-progress>todo']);
  let passed = 0;
  for (const from of statuses) {
    for (const to of statuses) {
      if (allowed.has(`${from}>${to}`)) {
        assert.doesNotThrow(() => assertTransition(from, to));
        passed += 1;
      } else {
        assert.throws(
          () => assertTransition(from, to),
          (err) => err instanceof ApiError && err.status === 409 && err.code === 'INVALID_STATUS_TRANSITION',
        );
      }
    }
  }
  assert.equal(passed, 3);
});

test('validatePatch rejects an empty object with 400', () => {
  assertApi400(() => validatePatch({}));
});

test('validatePatch rejects an unknown status value with 400', () => {
  assertApi400(() => validatePatch({ status: 'archived' }));
});

test('validatePatch normalizes tags', () => {
  assert.deepEqual(validatePatch({ tags: ['A', 'a'] }), { tags: ['a'] });
});

test('parseListQuery rejects unknown, repeated, blank, unsupported and over-long values', () => {
  for (const query of ['foo=1', 'tag=a&tag=b', 'tag=%20', 'sort=name', `tag=${'a'.repeat(51)}`]) {
    assertApi400(() => parseListQuery(new URL('http://x/?' + query).searchParams));
  }
});

test('parseListQuery accepts a 50-character tag and lowercases it', () => {
  assert.deepEqual(parseListQuery(new URL('http://x/?' + `tag=${'A'.repeat(50)}`).searchParams), {
    tag: 'a'.repeat(50),
    sort: undefined,
  });
});

test('sortByPriority does not mutate its input and keeps ties in input order', () => {
  const input = [
    { title: 'L1', priority: 'low' },
    { title: 'H1', priority: 'high' },
    { title: 'M1', priority: 'medium' },
    { title: 'H2', priority: 'high' },
  ];
  const snapshot = input.map((t) => t.title);
  const sorted = sortByPriority(input);
  assert.deepEqual(sorted.map((t) => t.title), ['H1', 'H2', 'M1', 'L1']);
  assert.deepEqual(input.map((t) => t.title), snapshot);
  assert.notEqual(sorted, input);
});
