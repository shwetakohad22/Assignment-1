import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEvaluation } from '../../.harness/lib/runner.js';
import { CHECKS_MAP } from '../../.harness/lib/checks.js';
import {
  DATASET,
  SPEC_TEXT,
  CANARY,
  idealOutput,
  diagLine,
  serviceFailure,
  createFakeRunCase,
  createRecordingSleep,
  fakeNow,
} from './fixtures.js';

const CASE_RESULT_FIELDS = [
  'id',
  'category',
  'guardrail',
  'classification',
  'exit_code',
  'timed_out',
  'layer1',
  'layer2',
  'task_score',
  'time_score',
  'semantic_score',
  'attempts',
  'failure_kind',
  'output',
];

function evaluate({ dataset = DATASET, runCase = createFakeRunCase(), sleep = createRecordingSleep(), keyForScan = '' } = {}) {
  return runEvaluation({ dataset, specText: SPEC_TEXT, canary: CANARY, runCase, sleep, now: fakeNow(), keyForScan });
}

function byId(report, id) {
  return report.cases.find((c) => c.id === id);
}

test('AC-19: an invalid dataset → verdict ERROR and runCase is never called', async () => {
  const bad = structuredClone(DATASET);
  bad.cases = bad.cases.slice(0, 14);
  const runCase = createFakeRunCase();
  const report = await evaluate({ dataset: bad, runCase });
  assert.equal(report.verdict, 'ERROR');
  assert.equal(report.exit_code, 2);
  assert.ok(report.dataset_errors.length > 0);
  assert.equal(runCase.calls.length, 0);
  assert.deepEqual(report.cases, []);
});

test('FR-24: cases run sequentially in dataset order, 13000 ms apart, input passed verbatim', async () => {
  const runCase = createFakeRunCase();
  const sleep = createRecordingSleep();
  const report = await evaluate({ runCase, sleep });
  assert.deepEqual(
    runCase.calls.map((c) => c.id),
    DATASET.cases.map((c) => c.id),
  );
  assert.deepEqual(
    runCase.calls.map((c) => c.input),
    DATASET.cases.map((c) => c.input),
  );
  assert.deepEqual(sleep.waits, Array(24).fill(13000));
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.totals.PASS, 25);
});

test('FR-39: a SERVICE_FAILURE case is invoked exactly once', async () => {
  const runCase = createFakeRunCase({ 'EV-03': () => serviceFailure('timeout') });
  const report = await evaluate({ runCase });
  assert.equal(runCase.calls.filter((c) => c.id === 'EV-03').length, 1);
  assert.equal(byId(report, 'EV-03').classification, 'SERVICE_FAILURE');
});

test('FR-30: worked-example row 4 (extra priority field, semantic 1.0) → FAIL with CHK-SCH-03', async () => {
  const runCase = createFakeRunCase({
    'EV-01': (c) => ({ stdout: JSON.stringify({ ...idealOutput(c), priority: 'high' }) + '\n', stderr: diagLine(), exitCode: 0, timedOut: false }),
  });
  const report = await evaluate({ runCase });
  const r = byId(report, 'EV-01');
  assert.equal(r.classification, 'FAIL');
  assert.ok(r.layer1.failed.includes('CHK-SCH-03'));
  assert.equal(r.semantic_score, 1);
});

test('FR-32: a timed-out case with empty stdout fails Layer 1 and is FAIL', async () => {
  const runCase = createFakeRunCase({ 'EV-02': () => ({ stdout: '', stderr: '', exitCode: null, timedOut: true }) });
  const report = await evaluate({ runCase });
  const r = byId(report, 'EV-02');
  assert.equal(r.classification, 'FAIL');
  assert.equal(r.timed_out, true);
  assert.deepEqual(r.layer1.failed, ['CHK-SCH-01']);
  assert.equal(r.output, null);
});

test('AC-20: every case result has all CaseResult fields of data-model.md', async () => {
  const runCase = createFakeRunCase({ 'EV-03': () => serviceFailure('5xx') });
  const report = await evaluate({ runCase });
  assert.equal(report.cases.length, 25);
  for (const r of report.cases) {
    assert.deepEqual(Object.keys(r).sort(), [...CASE_RESULT_FIELDS].sort(), r.id);
  }
});

test('FR-42: every emitted check ID exists in CHECKS_MAP', async () => {
  const runCase = createFakeRunCase({
    'EV-01': (c) => ({ stdout: JSON.stringify({ ...idealOutput(c), priority: 'high' }) + '\n', stderr: diagLine(), exitCode: 0, timedOut: false }),
    'EV-04': (c) => ({
      stdout: JSON.stringify({ ...idealOutput(c), datetime: '2026-11-12T09:00:00+05:30' }) + '\n',
      stderr: diagLine(),
      exitCode: 0,
      timedOut: false,
    }),
    'EV-07': (c) => ({ stdout: JSON.stringify({ ...idealOutput(c), intent: 'create' }) + '\n', stderr: diagLine(), exitCode: 0, timedOut: false }),
  });
  const report = await evaluate({ runCase });
  const emitted = report.cases.flatMap((r) => [...r.layer1.failed, ...r.layer2.failed]);
  assert.ok(emitted.length > 0);
  for (const id of emitted) {
    assert.ok(Object.prototype.hasOwnProperty.call(CHECKS_MAP, id), id);
  }
  assert.deepEqual(report.checks_map, CHECKS_MAP);
});

test('AC-21: SERVICE_FAILURE IDs are listed with their failure_kind', async () => {
  const runCase = createFakeRunCase({ 'EV-03': () => serviceFailure('429'), 'EV-06': () => serviceFailure('timeout') });
  const report = await evaluate({ runCase });
  assert.deepEqual(report.service_failure_ids, [
    { id: 'EV-03', failure_kind: '429' },
    { id: 'EV-06', failure_kind: 'timeout' },
  ]);
  assert.equal(byId(report, 'EV-03').failure_kind, '429');
  assert.equal(report.totals.SERVICE_FAILURE, 2);
});

test('CHK-SECRET: FR-24 a key value or AIza value in a case stderr → stderr_secret_hits, verdict ERROR, never stored', async () => {
  const keyForScan = 'fake-env-key-value-0123';
  const runtimeKey = 'AIza' + 'x'.repeat(35);
  for (const leaked of [keyForScan, runtimeKey]) {
    const runCase = createFakeRunCase({
      'EV-02': (c) => ({ stdout: JSON.stringify(idealOutput(c)) + '\n', stderr: `debug ${leaked}\n` + diagLine(), exitCode: 0, timedOut: false }),
    });
    const report = await evaluate({ runCase, keyForScan });
    assert.deepEqual(report.stderr_secret_hits, ['EV-02']);
    assert.equal(report.verdict, 'ERROR');
    assert.equal(report.exit_code, 2);
    assert.ok(report.notes.includes('secret_detected: stderr EV-02'));
    assert.equal(report.quality_gates.secrets.result, 'FAIL');
    const text = JSON.stringify(report);
    assert.ok(!text.includes(keyForScan));
    assert.ok(!text.includes(runtimeKey));
  }
});

test('CHK-SECRET: a clean stderr leaves stderr_secret_hits empty', async () => {
  const report = await evaluate({ keyForScan: 'fake-env-key-value-0123' });
  assert.deepEqual(report.stderr_secret_hits, []);
  assert.deepEqual(report.stdout_secret_hits, []);
  assert.equal(report.quality_gates.secrets.result, 'PASS');
});

test('FR-34: a key in a case raw stdout (parseable or not) → stdout_secret_hits, verdict ERROR, exit 2', async () => {
  const keyForScan = 'fake-env-key-value-0123';
  const runCase = createFakeRunCase({
    'EV-01': (c) => ({ stdout: JSON.stringify({ ...idealOutput(c), task: `call ${keyForScan}` }) + '\n', stderr: diagLine(), exitCode: 0, timedOut: false }),
    'EV-02': () => ({ stdout: `oops ${keyForScan}`, stderr: diagLine(), exitCode: 0, timedOut: false }),
  });
  const report = await evaluate({ runCase, keyForScan });
  assert.deepEqual(report.stdout_secret_hits, ['EV-01', 'EV-02']);
  assert.equal(report.verdict, 'ERROR');
  assert.equal(report.exit_code, 2);
  assert.ok(report.notes.includes('secret_detected: stdout EV-01'));
  assert.ok(report.notes.includes('secret_detected: stdout EV-02'));
  assert.ok(!JSON.stringify(report).includes(keyForScan));
});

test('R-03: notes record the CHK-SECRET limitation (.env contents are not read)', async () => {
  const report = await evaluate();
  assert.ok(report.notes.includes('CHK-SECRET checks the key value and the AIza pattern; .env contents are not read (Principle II)'));
  assert.equal(report.model, 'gemini-3.8-flash');
  assert.equal(report.spec_version, '1.6');
  assert.equal(report.reference_time, '2026-11-12T10:00:00+05:30');
});
