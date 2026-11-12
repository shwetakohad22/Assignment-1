import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  ROWS,
  validateOutput,
  exitCodeFor,
  refusalOutput,
  errorOutput,
  clarifyOutput,
  REFUSAL_MESSAGE,
  ERROR_MESSAGE,
  MALFORMED_QUESTION,
  PAST_TIME_QUESTION,
  OUT_OF_RANGE_QUESTION,
} from '../src/contract.js';
import { parseReferenceTime } from '../src/time.js';

const REF = parseReferenceTime('2026-11-12T10:00:00+05:30').ms;
const CANARY = 'RMDR-CANARY-7Q4X-K2M9';

function createOk(overrides = {}) {
  return {
    schema_version: '1.0',
    intent: 'create',
    status: 'ok',
    task: 'call mom',
    datetime: '2026-11-13T17:00:00+05:30',
    snooze_minutes: null,
    clarification_question: null,
    reason: null,
    ...overrides,
  };
}

function snoozeOk(overrides = {}) {
  return {
    schema_version: '1.0',
    intent: 'snooze',
    status: 'ok',
    task: null,
    datetime: null,
    snooze_minutes: 15,
    clarification_question: null,
    reason: null,
    ...overrides,
  };
}

test('INV-02: a missing field is reported', () => {
  const o = createOk();
  delete o.reason;
  assert.ok(validateOutput(o, REF, {}).includes('INV-02'));
});

test('INV-03: an extra field (priority) is reported', () => {
  assert.ok(validateOutput(createOk({ priority: 'high' }), REF, {}).includes('INV-03'));
});

test('INV-04: unsupported intent, wrong schema_version and unknown reason are reported', () => {
  assert.ok(validateOutput(createOk({ intent: 'delete_all' }), REF, {}).includes('INV-04'));
  assert.ok(validateOutput(createOk({ schema_version: '1' }), REF, {}).includes('INV-04'));
  assert.ok(
    validateOutput(clarifyOutput('missing_task', null, 'What?'), REF, {}).length === 0,
  );
  const badReason = { ...clarifyOutput('missing_task', null, 'What?'), reason: 'other' };
  assert.ok(validateOutput(badReason, REF, {}).includes('INV-04'));
});

test('INV-05: one passing and one failing object for each of the 6 FR-09 rows', () => {
  assert.equal(ROWS.length, 6);
  const cases = [
    { pass: createOk(), fail: createOk({ snooze_minutes: 5 }) },
    {
      pass: createOk({ intent: 'reschedule', task: 'dentist appointment' }),
      fail: createOk({ intent: 'reschedule', task: null }),
    },
    { pass: snoozeOk(), fail: snoozeOk({ clarification_question: 'Why?' }) },
    {
      pass: clarifyOutput('missing_time', 'buy groceries', 'When should I remind you?'),
      fail: { ...clarifyOutput('missing_task', null, 'What?'), task: 'something' },
    },
    { pass: refusalOutput('guardrail_injection'), fail: { ...refusalOutput('guardrail_injection'), reason: 'missing_time' } },
    { pass: errorOutput('invalid_model_output'), fail: { ...errorOutput('invalid_model_output'), clarification_question: null } },
  ];
  for (const { pass, fail } of cases) {
    assert.deepEqual(validateOutput(pass, REF, {}), [], JSON.stringify(pass));
    assert.ok(validateOutput(fail, REF, {}).includes('INV-05'), JSON.stringify(fail));
  }
});

test('INV-06: impossible datetime is reported', () => {
  assert.ok(validateOutput(createOk({ datetime: '2026-11-31T10:00:00+05:30' }), REF, {}).includes('INV-06'));
});

test('INV-07: snooze_minutes must be an integer 1-1440', () => {
  for (const bad of ['15', 15.5, 0, 1441]) {
    assert.ok(validateOutput(snoozeOk({ snooze_minutes: bad }), REF, {}).includes('INV-07'), String(bad));
  }
  assert.deepEqual(validateOutput(snoozeOk({ snooze_minutes: 1440 }), REF, {}), []);
});

test('INV-08: task > 200 chars, question > 300 chars and untrimmed text fail', () => {
  assert.ok(validateOutput(createOk({ task: 'a'.repeat(201) }), REF, {}).includes('INV-08'));
  const q = clarifyOutput('missing_time', 'x', 'q'.repeat(301));
  assert.ok(validateOutput(q, REF, {}).includes('INV-08'));
  assert.ok(validateOutput(createOk({ task: '  x' }), REF, {}).includes('INV-08'));
});

test('INV-09: create one second before the reference fails; equal instant passes', () => {
  assert.ok(validateOutput(createOk({ datetime: '2026-11-12T09:59:59+05:30' }), REF, {}).includes('INV-09'));
  assert.deepEqual(validateOutput(createOk({ datetime: '2026-11-12T10:00:00+05:30' }), REF, {}), []);
});

test('INV-10: reschedule one second before the reference fails; equal instant passes', () => {
  const r = (d) => createOk({ intent: 'reschedule', datetime: d });
  assert.ok(validateOutput(r('2026-11-12T09:59:59+05:30'), REF, {}).includes('INV-10'));
  assert.deepEqual(validateOutput(r('2026-11-12T10:00:00+05:30'), REF, {}), []);
});

test('INV-11: clarify with a datetime fails', () => {
  const o = { ...clarifyOutput('missing_time', 'x', 'When?'), datetime: '2026-11-13T17:00:00+05:30' };
  assert.ok(validateOutput(o, REF, {}).includes('INV-11'));
});

test('INV-12: a field containing the configured key or an AIza-pattern value fails', () => {
  const key = 'test-key-' + 'z'.repeat(10);
  assert.ok(validateOutput(createOk({ task: 'say ' + key }), REF, { key }).includes('INV-12'));
  const aiza = 'AIza' + 'x'.repeat(35);
  assert.ok(validateOutput(createOk({ task: aiza }), REF, {}).includes('INV-12'));
});

test('INV-13: a field containing the canary fails', () => {
  assert.ok(validateOutput(createOk({ task: 'x ' + CANARY }), REF, { canary: CANARY }).includes('INV-13'));
});

test('FR-07: exitCodeFor maps statuses and error reasons', () => {
  assert.equal(exitCodeFor(createOk()), 0);
  assert.equal(exitCodeFor(clarifyOutput('missing_time', 'x', 'When?')), 0);
  assert.equal(exitCodeFor(refusalOutput('guardrail_harmful')), 0);
  assert.equal(exitCodeFor(errorOutput('invalid_model_output')), 1);
  assert.equal(exitCodeFor(errorOutput('configuration_error')), 2);
  assert.equal(exitCodeFor(errorOutput('model_service_failure')), 3);
});

test('GR-06: refusalOutput is the fixed shape for each refusal reason', () => {
  for (const reason of ['guardrail_injection', 'guardrail_secret_request', 'guardrail_harmful']) {
    assert.deepEqual(refusalOutput(reason), {
      schema_version: SCHEMA_VERSION,
      intent: 'clarify',
      status: 'refused',
      task: null,
      datetime: null,
      snooze_minutes: null,
      clarification_question: REFUSAL_MESSAGE,
      reason,
    });
  }
});

test('GR-06: the five fixed messages are trimmed and 1-300 characters', () => {
  for (const m of [REFUSAL_MESSAGE, ERROR_MESSAGE, MALFORMED_QUESTION, PAST_TIME_QUESTION, OUT_OF_RANGE_QUESTION]) {
    assert.equal(typeof m, 'string');
    assert.equal(m, m.trim());
    assert.ok(m.length >= 1 && m.length <= 300);
  }
});
