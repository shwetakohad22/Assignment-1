import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGates } from '../../.harness/lib/gates.js';
import { CHECKS_MAP } from '../../.harness/lib/checks.js';

function caseResult(fields = {}) {
  return {
    id: 'EV-01',
    guardrail: false,
    classification: 'PASS',
    layer1: { pass: true, failed: [] },
    layer2: { pass: true, failed: [] },
    failure_kind: null,
    ...fields,
  };
}

function input(fields = {}) {
  return {
    caseResults: [caseResult()],
    verdict: 'PASS',
    datasetErrors: [],
    serviceFailureIds: [],
    stderrSecretHits: [],
    stdoutSecretHits: [],
    reportSecretHit: false,
    checksMap: CHECKS_MAP,
    ...fields,
  };
}

const GATES = ['lint', 'secrets', 'schema', 'invariant', 'evaluation', 'traceability', 'failure_reporting'];

test('FR-40: all seven gates are present, each with a result and a non-empty rule', () => {
  const g = computeGates(input());
  assert.deepEqual(Object.keys(g), GATES);
  for (const name of GATES) {
    assert.ok(['PASS', 'FAIL', 'NOT_EVALUATED'].includes(g[name].result), name);
    assert.equal(typeof g[name].rule, 'string');
    assert.ok(g[name].rule.length > 0, name);
  }
});

test('FR-40: lint is always NOT_EVALUATED', () => {
  assert.equal(computeGates(input()).lint.result, 'NOT_EVALUATED');
  assert.equal(computeGates(input({ verdict: 'FAIL' })).lint.result, 'NOT_EVALUATED');
});

test('FR-40: secrets FAIL on a stderr, stdout or report hit, else PASS', () => {
  assert.equal(computeGates(input()).secrets.result, 'PASS');
  assert.equal(computeGates(input({ stderrSecretHits: ['EV-02'] })).secrets.result, 'FAIL');
  assert.equal(computeGates(input({ stdoutSecretHits: ['EV-03'] })).secrets.result, 'FAIL');
  assert.equal(computeGates(input({ reportSecretHit: true })).secrets.result, 'FAIL');
});

test('FR-40: schema FAIL when a non-SERVICE_FAILURE case fails Layer 1', () => {
  const bad = caseResult({ classification: 'FAIL', layer1: { pass: false, failed: ['CHK-SCH-03'] } });
  assert.equal(computeGates(input({ caseResults: [caseResult(), bad] })).schema.result, 'FAIL');
  const svc = caseResult({ classification: 'SERVICE_FAILURE', layer1: { pass: false, failed: ['CHK-SCH-01'] }, failure_kind: 'timeout' });
  assert.equal(
    computeGates(input({ caseResults: [caseResult(), svc], serviceFailureIds: [{ id: 'EV-01', failure_kind: 'timeout' }] })).schema.result,
    'PASS',
  );
});

test('FR-40: invariant FAIL on a CHK-INV failure or a guardrail case FAIL', () => {
  const inv = caseResult({ classification: 'FAIL', layer2: { pass: false, failed: ['CHK-INV-09'] } });
  assert.equal(computeGates(input({ caseResults: [inv] })).invariant.result, 'FAIL');
  const prop = caseResult({ classification: 'FAIL', layer2: { pass: false, failed: ['CHK-PROP-INTENT'] } });
  assert.equal(computeGates(input({ caseResults: [prop] })).invariant.result, 'PASS');
  const guard = caseResult({ guardrail: true, classification: 'FAIL', layer2: { pass: false, failed: ['CHK-PROP-STATUS'] } });
  assert.equal(computeGates(input({ caseResults: [guard] })).invariant.result, 'FAIL');
});

test('FR-40: evaluation follows the verdict', () => {
  assert.equal(computeGates(input({ verdict: 'PASS' })).evaluation.result, 'PASS');
  assert.equal(computeGates(input({ verdict: 'FAIL' })).evaluation.result, 'FAIL');
  assert.equal(computeGates(input({ verdict: 'INCONCLUSIVE' })).evaluation.result, 'NOT_EVALUATED');
  assert.equal(computeGates(input({ verdict: 'ERROR' })).evaluation.result, 'NOT_EVALUATED');
});

test('FR-40: traceability FAIL on dataset errors or an unknown emitted check ID', () => {
  assert.equal(computeGates(input()).traceability.result, 'PASS');
  assert.equal(computeGates(input({ datasetErrors: ['bad'], caseResults: [] })).traceability.result, 'FAIL');
  const unknown = caseResult({ classification: 'FAIL', layer2: { pass: false, failed: ['CHK-UNKNOWN'] } });
  assert.equal(computeGates(input({ caseResults: [unknown] })).traceability.result, 'FAIL');
});

test('FR-40: failure_reporting FAIL when a SERVICE_FAILURE is not listed or lacks failure_kind', () => {
  const svc = caseResult({ id: 'EV-03', classification: 'SERVICE_FAILURE', failure_kind: '429' });
  assert.equal(
    computeGates(input({ caseResults: [svc], serviceFailureIds: [{ id: 'EV-03', failure_kind: '429' }] })).failure_reporting.result,
    'PASS',
  );
  assert.equal(computeGates(input({ caseResults: [svc], serviceFailureIds: [] })).failure_reporting.result, 'FAIL');
  const noKind = caseResult({ id: 'EV-03', classification: 'SERVICE_FAILURE', failure_kind: null });
  assert.equal(
    computeGates(input({ caseResults: [noKind], serviceFailureIds: [{ id: 'EV-03', failure_kind: null }] })).failure_reporting.result,
    'FAIL',
  );
});

test('FR-40: with a dataset error (no cases run) schema, invariant and failure_reporting are NOT_EVALUATED', () => {
  const g = computeGates(input({ caseResults: [], datasetErrors: ['bad'], verdict: 'ERROR' }));
  assert.equal(g.schema.result, 'NOT_EVALUATED');
  assert.equal(g.invariant.result, 'NOT_EVALUATED');
  assert.equal(g.failure_reporting.result, 'NOT_EVALUATED');
});

test('FR-40: computeGates never modifies verdict, overall_score or exit_code', () => {
  const report = { verdict: 'FAIL', overall_score: 0.72, exit_code: 1 };
  const before = structuredClone(report);
  const args = input({ verdict: report.verdict, caseResults: [caseResult({ classification: 'FAIL' })] });
  const argsBefore = structuredClone(args);
  computeGates(args);
  assert.deepEqual(report, before);
  assert.deepEqual(args, argsBefore);
});
