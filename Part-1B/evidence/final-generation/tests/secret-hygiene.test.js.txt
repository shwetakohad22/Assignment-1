import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGeminiClient } from '../src/gemini-client.js';
import { createFakeFetch, geminiBody } from './fakes/fake-fetch.js';
import { scenarios, runScenario } from './fakes/agent-scenarios.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_KEY = 'AIza' + 'k'.repeat(35);
// Built at runtime so this file does not match its own static scan.
const DOT_ENV = '.' + 'env';
const PROCESS_ENV = 'process' + '.env';

function jsFiles(dir) {
  return fs
    .readdirSync(path.join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f).split(path.sep).join('/'));
}

const SCANNED = [...jsFiles('src'), ...jsFiles('.harness'), ...jsFiles('tests')];

test('GR-08: (a) the key is sent only in the x-goog-api-key header, never in the URL or body', async () => {
  const fakeFetch = createFakeFetch([{ status: 200, json: geminiBody({ a: 1 }) }]);
  const client = createGeminiClient({ apiKey: FAKE_KEY, model: 'gemini-3.8-flash', fetch: fakeFetch, sleep: async () => {} });
  await client.generate({ contents: [] });
  assert.equal(fakeFetch.calls.length, 1);
  const { url, init } = fakeFetch.calls[0];
  assert.ok(!String(url).includes(FAKE_KEY));
  assert.ok(!String(init.body).includes(FAKE_KEY));
  assert.equal(init.headers['x-goog-api-key'], FAKE_KEY);
  for (const [name, value] of Object.entries(init.headers)) {
    if (name !== 'x-goog-api-key') assert.ok(!String(value).includes(FAKE_KEY), name);
  }
});

test('FR-16h: (b) for every AC-23 scenario, stdout and stderr never contain the key', async () => {
  for (const s of scenarios(FAKE_KEY)) {
    const { stdout, stderr } = await runScenario(s);
    assert.ok(!stdout.includes(FAKE_KEY), `stdout: ${s.label}`);
    assert.ok(!stderr.includes(FAKE_KEY), `stderr: ${s.label}`);
  }
});

test('GR-08: (c) no source, harness or test file opens or reads a .env path', () => {
  assert.ok(SCANNED.length > 20);
  const call = /\b(readFile|readFileSync|open|openSync|createReadStream)\s*\(([^)]*)\)/g;
  for (const file of SCANNED) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of text.matchAll(call)) {
      assert.ok(!m[2].includes(DOT_ENV), `${file}: ${m[0]}`);
    }
  }
});

test('GR-08: (c) process environment access only in src/cli.js and .harness/run-evals.js', () => {
  const allowed = new Set(['src/cli.js', '.harness/run-evals.js']);
  const users = SCANNED.filter((file) => fs.readFileSync(path.join(ROOT, file), 'utf8').includes(PROCESS_ENV));
  for (const file of users) assert.ok(allowed.has(file), file);
  assert.ok(users.includes('src/cli.js'));
  assert.ok(users.includes('.harness/run-evals.js'));
});
