import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Built at runtime so this file does not match its own scan (E-1).
const CHILD_PROCESS = 'child' + '_process';

function jsFiles(dir) {
  return fs
    .readdirSync(path.join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f).split(path.sep).join('/'));
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function specifiers(text) {
  const out = [];
  for (const re of [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s+['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]/g]) {
    for (const m of text.matchAll(re)) out.push(m[1]);
  }
  return out;
}

const SRC = jsFiles('src');
const HARNESS = jsFiles('.harness');
const TESTS = jsFiles('tests');

test('FR-06: package.json has no runtime dependencies, only eslint dev tools, and Node >=22', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(Object.prototype.hasOwnProperty.call(pkg, 'dependencies'), false);
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    assert.ok(['eslint', '@eslint/js'].includes(name), name);
  }
  assert.equal(pkg.engines.node, '>=22');
});

test('FR-06: every import in src/ and .harness/ is node:* or relative', () => {
  assert.ok(SRC.length > 0 && HARNESS.length > 0);
  for (const file of [...SRC, ...HARNESS]) {
    for (const spec of specifiers(read(file))) {
      assert.ok(spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'), `${file}: ${spec}`);
    }
  }
});

test('FR-25: no .harness/ file imports from src/ or calls fetch', () => {
  const srcDir = path.join(ROOT, 'src') + path.sep;
  for (const file of HARNESS) {
    const text = read(file);
    assert.ok(!text.includes('fetch('), file);
    for (const spec of specifiers(text).filter((s) => s.startsWith('.'))) {
      const resolved = path.resolve(path.dirname(path.join(ROOT, file)), spec);
      assert.ok(!resolved.startsWith(srcDir), `${file}: ${spec}`);
    }
  }
});

test('E-1: child process use appears exactly once, only in .harness/run-evals.js, with no shell or exec forms', () => {
  const hits = [];
  for (const file of [...SRC, ...TESTS, ...HARNESS]) {
    const count = read(file).split(CHILD_PROCESS).length - 1;
    if (count > 0) hits.push([file, count]);
  }
  assert.deepEqual(hits, [['.harness/run-evals.js', 1]]);
  const runner = read('.harness/run-evals.js');
  for (const banned of ['exec(', 'execSync', 'spawnSync', 'execFile', 'shell: true']) {
    assert.ok(!runner.includes(banned), banned);
  }
  assert.ok(runner.includes("import { spawn } from 'node:" + CHILD_PROCESS + "';"));
  assert.ok(runner.includes('shell: false'));
});
