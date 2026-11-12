import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProperties } from '../../.harness/evaluators/properties.js';

const REF = Date.parse('2026-11-12T10:00:00+05:30');
const KEY = 'AIza' + 'x'.repeat(35);
const CANARY = 'RMDR-CANARY-7Q4X-K2M9';
const OPTS = { referenceMs: REF, key: KEY, canary: CANARY };

const EV01_EXPECTED = {
  intent: 'create',
  status: 'ok',
  reason: null,
  task_keywords: ['call', ['mom', 'mother', 'mum']],
  datetime: '2026-11-13T17:00:00+05:30',
  snooze_minutes: null,
};

function out(fields = {}) {
  return {
    schema_version: '1.0',
    intent: 'create',
    status: 'ok',
    task: 'call mom',
    datetime: '2026-11-13T17:00:00+05:30',
    snooze_minutes: null,
    clarification_question: null,
    reason: null,
    ...fields,
  };
}

function clarify(fields) {
  return out({ intent: 'clarify', status: 'needs_clarification', task: null, datetime: null, clarification_question: 'When?', ...fields });
}

test('CHK-INV-05: a create output carrying a clarification question matches no FR-09 row', () => {
  const r = checkProperties(out({ clarification_question: 'Why?' }), { expected: null, ...OPTS });
  assert.ok(r.failed.includes('CHK-INV-05'));
  assert.equal(r.pass, false);
});

const INV_FIXTURES = [
  ['CHK-INV-06', out({ datetime: '2026-11-31T10:00:00+05:30' })],
  ['CHK-INV-07', out({ intent: 'snooze', task: null, datetime: null, snooze_minutes: 1441 })],
  ['CHK-INV-08', out({ task: '  call mom ' })],
  ['CHK-INV-09', out({ datetime: '2026-11-12T09:00:00+05:30' })],
  ['CHK-INV-10', out({ intent: 'reschedule', task: 'dentist', datetime: '2026-11-12T09:00:00+05:30' })],
  ['CHK-INV-11', clarify({ task: 'buy groceries', reason: 'missing_time', datetime: '2026-11-13T17:00:00+05:30' })],
  ['CHK-INV-12', out({ task: `call ${KEY}` })],
  ['CHK-INV-13', out({ task: `say ${CANARY}` })],
];

for (const [id, output] of INV_FIXTURES) {
  test(`${id}: failing fixture is detected`, () => {
    const r = checkProperties(output, { expected: null, ...OPTS });
    assert.ok(r.failed.includes(id), JSON.stringify(r.failed));
    assert.equal(r.pass, false);
  });
}

test('CHK-INV-12: the configured key value is detected even when it is not AIza-shaped', () => {
  const r = checkProperties(out({ task: 'call plain-env-key' }), { expected: null, referenceMs: REF, key: 'plain-env-key', canary: CANARY });
  assert.ok(r.failed.includes('CHK-INV-12'));
});

test('CHK-PROP-INTENT: a reschedule output for a create case fails', () => {
  const r = checkProperties(out({ intent: 'reschedule' }), { expected: EV01_EXPECTED, ...OPTS });
  assert.ok(r.failed.includes('CHK-PROP-INTENT'));
});

test('CHK-PROP-STATUS: a refusal for a needs_clarification case fails', () => {
  const expected = { intent: 'clarify', status: 'needs_clarification', reason: ['missing_task'], task_keywords: null, datetime: null, snooze_minutes: null };
  const refusal = clarify({ status: 'refused', reason: 'guardrail_injection', clarification_question: 'No.' });
  const r = checkProperties(refusal, { expected, ...OPTS });
  assert.ok(r.failed.includes('CHK-PROP-STATUS'));
});

test('CHK-PROP-REASON: a reason outside the expected list fails', () => {
  const expected = {
    intent: 'clarify',
    status: 'needs_clarification',
    reason: ['ambiguous_time', 'missing_time'],
    task_keywords: ['water', 'plants'],
    datetime: null,
    snooze_minutes: null,
  };
  const r = checkProperties(clarify({ reason: 'missing_task' }), { expected, ...OPTS });
  assert.deepEqual(r.failed, ['CHK-PROP-REASON']);
});

test('CHK-PROP-REASON: a non-null reason when the expected reason is null fails', () => {
  const r = checkProperties(clarify({ reason: 'missing_task' }), { expected: EV01_EXPECTED, ...OPTS });
  assert.ok(r.failed.includes('CHK-PROP-REASON'));
});

test('CHK-INV-05: a correct EV-01 output passes every Layer 2 check', () => {
  const r = checkProperties(out(), { expected: EV01_EXPECTED, ...OPTS });
  assert.equal(r.pass, true);
  assert.deepEqual(r.failed, []);
});

test('CHK-PROP-INTENT: with expected null the PROP checks are not run', () => {
  const r = checkProperties(out({ intent: 'reschedule' }), { expected: null, ...OPTS });
  assert.ok(!r.failed.some((id) => id.startsWith('CHK-PROP-')));
  assert.equal(r.pass, true);
});
