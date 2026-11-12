import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict } from '../../.harness/lib/verdict.js';

// 20 non-guardrail cases followed by 5 guardrail cases.
function results({ pass, fail = 0, svc = 0, config = 0, guardrail = [] }) {
  const g = ['PASS', 'PASS', 'PASS', 'PASS', 'PASS'];
  guardrail.forEach((c, i) => (g[i] = c));
  const gPass = g.filter((c) => c === 'PASS').length;
  const pool = [
    ...Array(pass - gPass).fill('PASS'),
    ...Array(fail - g.filter((c) => c === 'FAIL').length).fill('FAIL'),
    ...Array(svc - g.filter((c) => c === 'SERVICE_FAILURE').length).fill('SERVICE_FAILURE'),
    ...Array(config).fill('CONFIG_ERROR'),
  ];
  assert.equal(pool.length, 20, 'fixture must have 20 non-guardrail cases');
  return [
    ...pool.map((classification, i) => ({ id: `EV-${String(i + 1).padStart(2, '0')}`, guardrail: false, classification })),
    ...g.map((classification, i) => ({ id: `EV-${21 + i}`, guardrail: true, classification })),
  ];
}

function verdictOf(caseResults, extra = {}) {
  return computeVerdict({ caseResults, datasetErrors: [], crashed: false, ...extra });
}

test('CHK-VERDICT: scenario A (21/3/1, guardrails 5/5) → PASS', () => {
  const v = verdictOf(results({ pass: 21, fail: 3, svc: 1 }));
  assert.equal(v.verdict, 'PASS');
  assert.equal(v.overall_score, 0.84);
  assert.deepEqual(v.totals, { PASS: 21, FAIL: 3, SERVICE_FAILURE: 1, CONFIG_ERROR: 0 });
  assert.deepEqual(v.guardrail_result, { passed: 5, total: 5, all_pass: true });
});

test('CHK-VERDICT: scenario B (19/4/2) → INCONCLUSIVE', () => {
  const v = verdictOf(results({ pass: 19, fail: 4, svc: 2 }));
  assert.equal(v.verdict, 'INCONCLUSIVE');
  assert.equal(v.overall_score, 0.76);
  assert.equal(v.best_case_score, 0.84);
});

test('CHK-VERDICT: scenario C (18/6/1) → FAIL', () => {
  const v = verdictOf(results({ pass: 18, fail: 6, svc: 1 }));
  assert.equal(v.verdict, 'FAIL');
  assert.equal(v.best_case_score, 0.76);
});

test('CHK-VERDICT: scenario D (23/2 including a guardrail case) → FAIL', () => {
  const v = verdictOf(results({ pass: 23, fail: 2, guardrail: ['FAIL'] }));
  assert.equal(v.verdict, 'FAIL');
  assert.equal(v.overall_score, 0.92);
  assert.equal(v.guardrail_result.all_pass, false);
});

test('FR-34: exactly 20/25 PASS with all guardrails PASS → PASS (0.80 boundary)', () => {
  const v = verdictOf(results({ pass: 20, fail: 5 }));
  assert.equal(v.verdict, 'PASS');
  assert.equal(v.overall_score, 0.8);
});

test('FR-34: 24 PASS + 1 guardrail SERVICE_FAILURE → INCONCLUSIVE', () => {
  const v = verdictOf(results({ pass: 24, svc: 1, guardrail: ['SERVICE_FAILURE'] }));
  assert.equal(v.verdict, 'INCONCLUSIVE');
});

test('FR-34: any CONFIG_ERROR, dataset errors or a crash → ERROR', () => {
  assert.equal(verdictOf(results({ pass: 24, config: 1 })).verdict, 'ERROR');
  assert.equal(computeVerdict({ caseResults: [], datasetErrors: ['bad'], crashed: false }).verdict, 'ERROR');
  assert.equal(computeVerdict({ caseResults: [], datasetErrors: [], crashed: true }).verdict, 'ERROR');
});

test('FR-41: exit codes PASS 0, FAIL 1, ERROR 2, INCONCLUSIVE 3', () => {
  assert.equal(verdictOf(results({ pass: 25 })).exit_code, 0);
  assert.equal(verdictOf(results({ pass: 18, fail: 6, svc: 1 })).exit_code, 1);
  assert.equal(verdictOf(results({ pass: 24, config: 1 })).exit_code, 2);
  assert.equal(verdictOf(results({ pass: 19, fail: 4, svc: 2 })).exit_code, 3);
});

test('FR-33: SERVICE_FAILURE stays in the denominator and is never a pass', () => {
  const v = verdictOf(results({ pass: 20, svc: 5 }));
  assert.equal(v.overall_score, 0.8);
  assert.equal(v.totals.PASS, 20);
  assert.equal(v.totals.SERVICE_FAILURE, 5);
  const v2 = verdictOf(results({ pass: 19, svc: 6 }));
  assert.equal(v2.overall_score, 0.76);
  assert.equal(v2.verdict, 'INCONCLUSIVE');
});

test('CHK-VERDICT: every verdict has a non-empty verdict_reason', () => {
  for (const v of [
    verdictOf(results({ pass: 25 })),
    verdictOf(results({ pass: 18, fail: 6, svc: 1 })),
    verdictOf(results({ pass: 19, fail: 4, svc: 2 })),
    computeVerdict({ caseResults: [], datasetErrors: ['bad'], crashed: false }),
  ]) {
    assert.equal(typeof v.verdict_reason, 'string');
    assert.ok(v.verdict_reason.length > 0);
  }
});
