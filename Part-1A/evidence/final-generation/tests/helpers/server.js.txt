import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createStore, loadTasks } from '../../src/store.js';
import { createApp } from '../../src/app.js';

const ENTRY = path.resolve(import.meta.dirname, '..', '..', 'src', 'index.js');
const LISTENING = /Listening on (http:\/\/127\.0\.0\.1:\d+)/;
const PROCESS_TIMEOUT_MS = 10000;

export async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'todo-api-'));
}

export async function startServer({ dataFile } = {}) {
  const file = dataFile ?? path.join(await makeTempDir(), 'tasks.json');
  const tasks = await loadTasks(file);
  const store = createStore(file, tasks);
  const server = http.createServer(createApp(store));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dataFile: file,
    store,
    async close() {
      await store.idle();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}

function spawnApp(dataFile, env) {
  return spawn(process.execPath, [ENTRY], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_FILE: dataFile, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function startProcess({ dataFile, env = {} }) {
  const child = spawnApp(dataFile, env);
  const exited = new Promise((resolve) => child.once('exit', resolve));
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Process did not start in time. stderr: ${stderr}`));
    }, PROCESS_TIMEOUT_MS);
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.stdout.on('data', (d) => {
      stdout += d;
      const match = LISTENING.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolve({
          baseUrl: match[1],
          child,
          async stop() {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill();
            }
            await exited;
          },
        });
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Process exited early with code ${code}. stderr: ${stderr}`));
    });
  });
}

export function runProcessToExit({ dataFile, env = {} }) {
  const child = spawnApp(dataFile, env);
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Process did not exit in time'));
    }, PROCESS_TIMEOUT_MS);
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}
