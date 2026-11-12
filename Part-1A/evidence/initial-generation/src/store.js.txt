import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataFileError, taskNotFound } from './errors.js';
import { assertTransition, isValidStoredTask, validateCreate, validatePatch } from './tasks.js';

const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_WAITS_MS = [10, 20, 40, 80, 160];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadTasks(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw new DataFileError(`Cannot read data file (${err.code ?? 'unknown error'})`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DataFileError('Data file is not valid JSON');
  }
  if (!Array.isArray(data)) {
    throw new DataFileError('Data file must contain a JSON array of tasks');
  }
  const ids = new Set();
  data.forEach((task, index) => {
    if (!isValidStoredTask(task)) {
      throw new DataFileError(`Data file has an invalid task at index ${index}`);
    }
    if (ids.has(task.id)) {
      throw new DataFileError(`Data file has a duplicate task id at index ${index}`);
    }
    ids.add(task.id);
  });
  return data;
}

async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      if (!RENAME_RETRY_CODES.has(err.code) || attempt >= RENAME_WAITS_MS.length) {
        throw err;
      }
      await wait(RENAME_WAITS_MS[attempt]);
    }
  }
}

export async function saveTasks(file, tasks) {
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const fh = await open(tmp, 'wx');
    try {
      await fh.writeFile(JSON.stringify(tasks, null, 2) + '\n', 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    await renameWithRetry(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

export function createStore(file, initialTasks) {
  let tasks = initialTasks;
  let tail = Promise.resolve();

  // Called only after saveTasks(file, next) has succeeded.
  function commit(next) {
    tasks = next;
  }

  function exclusive(fn) {
    const run = tail.then(fn);
    tail = run.catch(() => {});
    return run;
  }

  return {
    list() {
      return [...tasks];
    },
    get(id) {
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        throw taskNotFound(id);
      }
      return task;
    },
    idle() {
      return tail;
    },
    exclusive,
    create(body) {
      return exclusive(async () => {
        const input = validateCreate(body);
        const task = {
          id: randomUUID(),
          title: input.title,
          status: 'todo',
          priority: input.priority,
          tags: input.tags,
          createdAt: new Date().toISOString(),
        };
        const next = [...tasks, task];
        await saveTasks(file, next);
        commit(next);
        return task;
      });
    },
    update(id, body) {
      return exclusive(async () => {
        const index = tasks.findIndex((t) => t.id === id);
        if (index === -1) {
          throw taskNotFound(id);
        }
        const current = tasks[index];
        const changes = validatePatch(body);
        if ('status' in changes) {
          assertTransition(current.status, changes.status);
        }
        const pick = (key) => (key in changes ? changes[key] : current[key]);
        const task = {
          id: current.id,
          title: pick('title'),
          status: pick('status'),
          priority: pick('priority'),
          tags: pick('tags'),
          createdAt: current.createdAt,
        };
        const next = [...tasks];
        next[index] = task;
        await saveTasks(file, next);
        commit(next);
        return task;
      });
    },
    remove(id) {
      return exclusive(async () => {
        const index = tasks.findIndex((t) => t.id === id);
        if (index === -1) {
          throw taskNotFound(id);
        }
        const next = tasks.filter((t) => t.id !== id);
        await saveTasks(file, next);
        commit(next);
      });
    },
  };
}
