import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runEvaluation } from '../../.harness/lib/runner.js';
import { writeReport, renderSummary } from '../../.harness/lib/report.js';
import { DATASET, SPEC_TEXT, CANARY, serviceFailure, createFakeRunCase, createRecordingSleep, fakeNow } from './fixtures.js';

const TOP_LEVEL_FIELDS = [
  'run_id',
  'spec_version',
  'dataset_version',
  'reference_time',
  'timezone',
  'model',
  'started_at',
  'finished_at',
  'threshold',
  'cases',
  'totals',
  'service_failure_ids',
  'overall_score',
  'best_case_score',
  'guardrail_result',
  'verdict',
  'verdict_reason',
  'exit_code',
  'dataset_errors',
  'checks_map',
  'stderr_secret_hits',
  'stdout_secret_hits',
  'quality_gates',
  'notes',
];
const GATES = ['lint', 'secrets', 'schema', 'invariant', 'evaluation', 'traceability', 'failure_reporting'];

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eval-'));
}

async function makeReport({ runId, overrides = { 'EV-03': () => serviceFailure('429') } } = {}) {
  return runEvaluation({
    dataset: DATASET,
    specText: SPEC_TEXT,
    canary: CANARY,
    runCase: createFakeRunCase(overrides),
    sleep: createRecordingSleep(),
    now: fakeNow(),
    keyForScan: '',
    runId,
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('FR-40: the written JSON report has every top-level field and all 7 quality gates', async () => {
  const dir = tempDir();
  const report = await makeReport({ runId: 'run-a' });
  const { runDir } = writeReport(report, { evidenceDir: dir, keyForScan: '' });
  const written = readJson(path.join(runDir, 'eval-results.json'));
  for (const field of TOP_LEVEL_FIELDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(written, field), field);
  }
  assert.deepEqual(Object.keys(written.quality_gates), GATES);
  assert.ok(Array.isArray(written.stderr_secret_hits));
  assert.deepEqual(readJson(path.join(dir, 'eval-results.json')), written);
});

test('FR-40: summary.md has the verdict line, totals, service-failure IDs, a gates table and a per-case table', async () => {
  const dir = tempDir();
  const report = await makeReport({ runId: 'run-b' });
  const { runDir } = writeReport(report, { evidenceDir: dir, keyForScan: '' });
  const summary = fs.readFileSync(path.join(runDir, 'summary.md'), 'utf8');
  assert.ok(summary.includes(`**Verdict**: ${report.verdict}`));
  assert.ok(summary.includes('PASS 24'));
  assert.ok(summary.includes('SERVICE_FAILURE 1'));
  assert.ok(summary.includes('EV-03 (429)'));
  assert.ok(summary.includes('| Gate | Result | Rule |'));
  assert.ok(summary.includes('| ID | Category | Guardrail | Classification |'));
  assert.equal(summary, renderSummary(readJson(path.join(runDir, 'eval-results.json'))));
});

test('CHK-SECRET: AC-22 a key value or AIza value in a case output is redacted, verdict ERROR, secrets gate FAIL', async () => {
  const keyForScan = 'fake-env-key-value-0123';
  const runtimeKey = 'AIza' + 'q'.repeat(35);
  for (const leaked of [keyForScan, runtimeKey]) {
    const dir = tempDir();
    const report = await makeReport({ runId: 'run-c' });
    report.cases[0].output.task = `call ${leaked}`;
    const { report: final, runDir } = writeReport(report, { evidenceDir: dir, keyForScan });
    for (const file of [path.join(runDir, 'eval-results.json'), path.join(runDir, 'summary.md'), path.join(dir, 'eval-results.json')]) {
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(!text.includes(leaked), file);
    }
    const written = readJson(path.join(runDir, 'eval-results.json'));
    assert.ok(JSON.stringify(written).includes('[REDACTED]'));
    assert.equal(written.verdict, 'ERROR');
    assert.equal(written.exit_code, 2);
    assert.equal(written.quality_gates.secrets.result, 'FAIL');
    assert.ok(written.notes.some((n) => n.includes('secret_detected')));
    assert.equal(final.verdict, 'ERROR');
  }
});

test('CHK-SECRET: a clean report gets the clean CHK-SECRET note', async () => {
  const dir = tempDir();
  const { report } = writeReport(await makeReport({ runId: 'run-d' }), { evidenceDir: dir, keyForScan: 'fake-env-key-value-0123' });
  assert.ok(report.notes.some((n) => n.startsWith('CHK-SECRET') && n.endsWith('clean')));
  assert.ok(!report.notes.some((n) => n.includes('secret_detected')));
});

test('R-12: writing twice to the same run_id throws and leaves the first files unchanged', async () => {
  const dir = tempDir();
  const first = await makeReport({ runId: 'run-same' });
  const { runDir } = writeReport(first, { evidenceDir: dir, keyForScan: '' });
  const before = fs.readFileSync(path.join(runDir, 'eval-results.json'), 'utf8');
  const second = await makeReport({ runId: 'run-same', overrides: {} });
  assert.throws(() => writeReport(second, { evidenceDir: dir, keyForScan: '' }));
  assert.equal(fs.readFileSync(path.join(runDir, 'eval-results.json'), 'utf8'), before);
});

test('R-12: evidence/eval-results.json is overwritten by a new run', async () => {
  const dir = tempDir();
  writeReport(await makeReport({ runId: 'run-one' }), { evidenceDir: dir, keyForScan: '' });
  assert.equal(readJson(path.join(dir, 'eval-results.json')).run_id, 'run-one');
  writeReport(await makeReport({ runId: 'run-two', overrides: {} }), { evidenceDir: dir, keyForScan: '' });
  assert.equal(readJson(path.join(dir, 'eval-results.json')).run_id, 'run-two');
  assert.ok(fs.existsSync(path.join(dir, 'eval-runs', 'run-one', 'eval-results.json')));
  assert.ok(fs.existsSync(path.join(dir, 'eval-runs', 'run-two', 'summary.md')));
});
