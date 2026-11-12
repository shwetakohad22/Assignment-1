import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DataFileError } from '../src/errors.js';
import { createStore, loadTasks, saveTasks } from '../src/store.js';
import { makeTempDir } from './helpers/server.js';

const sampleValidTask = {
  id: 'task-1',
  title: 'Buy milk',
  status: 'todo',
  priority: 'medium',
  tags: [],
  createdAt: '2026-11-10T09:30:00.000Z',
};

async function listTmp(dir) {
  return (await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'));
}

async function exists(file) {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

test('loadTasks returns [] for a missing file and does not create it', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'tasks.json');
  assert.deepEqual(await loadTasks(file), []);
  assert.equal(await exists(file), false);
});

const badContents = {
  'not json': 'not json',
  'an object': '{}',
  'an empty file': '',
  'an invalid task': JSON.stringify([{ ...sampleValidTask, status: 'archived' }]),
  'duplicate ids': JSON.stringify([sampleValidTask, sampleValidTask]),
};

for (const [label, content] of Object.entries(badContents)) {
  test(`loadTasks rejects ${label} with DataFileError and leaves the file unchanged`, async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'tasks.json');
    await fs.writeFile(file, content);
    const before = await fs.readFile(file);
    await assert.rejects(loadTasks(file), DataFileError);
    assert.deepEqual(await fs.readFile(file), before);
  });
}

test('saveTasks writes 2-space JSON with a trailing newline and leaves no tmp file', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'tasks.json');
  await saveTasks(file, [sampleValidTask]);
  assert.equal(await fs.readFile(file, 'utf8'), JSON.stringify([sampleValidTask], null, 2) + '\n');
  assert.deepEqual(await listTmp(dir), []);
});

test('exclusive runs queued functions strictly in order', async () => {
  const dir = await makeTempDir();
  const store = createStore(path.join(dir, 'tasks.json'), []);
  const order = [];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.all([
    store.exclusive(async () => {
      order.push('1-start');
      await delay(40);
      order.push('1-end');
    }),
    store.exclusive(async () => {
      order.push('2-start');
      await delay(20);
      order.push('2-end');
    }),
    store.exclusive(async () => {
      order.push('3-start');
      order.push('3-end');
    }),
  ]);
  assert.deepEqual(order, ['1-start', '1-end', '2-start', '2-end', '3-start', '3-end']);
});

test('exclusive keeps running after a queued function throws', async () => {
  const dir = await makeTempDir();
  const store = createStore(path.join(dir, 'tasks.json'), []);
  const failing = store.exclusive(async () => {
    throw new Error('boom');
  });
  const next = store.exclusive(async () => 'ran');
  await assert.rejects(failing, /boom/);
  assert.equal(await next, 'ran');
});

test('saveTasks rejects when the parent is a regular file and leaves no tmp file', async () => {
  const dir = await makeTempDir();
  const blocked = path.join(dir, 'blocked');
  await fs.writeFile(blocked, '');
  await assert.rejects(saveTasks(path.join(blocked, 'tasks.json'), [sampleValidTask]));
  assert.deepEqual(await listTmp(dir), []);
});

test('a failed save inside exclusive leaves the store list unchanged and the lock usable', async () => {
  const dir = await makeTempDir();
  const blocked = path.join(dir, 'blocked');
  await fs.writeFile(blocked, '');
  const file = path.join(blocked, 'tasks.json');
  const store = createStore(file, []);
  await assert.rejects(store.exclusive(() => saveTasks(file, [sampleValidTask])));
  assert.deepEqual(store.list(), []);
  assert.equal(await store.exclusive(async () => 'still running'), 'still running');
});
