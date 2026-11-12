import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/normalize.js';
import {
  errorOutput,
  refusalOutput,
  clarifyOutput,
  validateOutput,
  PAST_TIME_QUESTION,
  OUT_OF_RANGE_QUESTION,
  SCHEMA_VERSION,
  INTENTS,
  STATUSES,
  ALL_REASONS,
} from '../src/contract.js';
import { parseReferenceTime } from '../src/time.js';

const REF = parseReferenceTime('2026-11-12T10:00:00+05:30').ms;

function modelCreate(overrides = {}) {
  return {
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

const FIXED_OUTPUT_WORDS = Object.freeze([SCHEMA_VERSION, ...INTENTS, ...STATUSES, ...ALL_REASONS]);

// ---------------------------------------------------------------- base section

test('FR-10: non-conforming replies become invalid_model_output and never echo the raw text', () => {
  const missingReason = modelCreate();
  delete missingReason.reason;
  const replies = [
    'Sure! Your reminder is set for tomorrow at 5pm.',
    '```json\n' + JSON.stringify(modelCreate()) + '\n```',
    JSON.stringify([modelCreate()]),
    'null',
    JSON.stringify(missingReason),
    JSON.stringify(modelCreate({ priority: 'high' })),
    JSON.stringify(modelCreate({ intent: 'delete_all' })),
    JSON.stringify(modelCreate({ status: 'error' })),
    JSON.stringify({ ...modelCreate(), intent: 'clarify', status: 'error', task: null, datetime: null, clarification_question: 'x', reason: 'invalid_model_output' }),
    JSON.stringify(modelCreate({ task: 5 })),
    JSON.stringify(modelCreate({ datetime: '2026-11-13T17:00:00Z' })),
    JSON.stringify(modelCreate({ datetime: '2026-11-31T10:00:00+05:30' })),
  ];
  for (const text of replies) {
    const out = normalize(text, { referenceMs: REF });
    assert.deepEqual(out, errorOutput('invalid_model_output'), text);
    // Compare against the string values in the output, not the serialised JSON text
    // (the JSON always contains the literal `null` for null fields).
    const isFixedWord = FIXED_OUTPUT_WORDS.includes(text);
    for (const value of Object.values(out).filter((v) => typeof v === 'string')) {
      assert.ok(isFixedWord || (value !== text && !value.includes(text)), text);
    }
  }
});

test('FR-10: null or empty reply text → invalid_model_output', () => {
  assert.deepEqual(normalize(null, { referenceMs: REF }), errorOutput('invalid_model_output'));
  assert.deepEqual(normalize('', { referenceMs: REF }), errorOutput('invalid_model_output'));
});

test('FR-10: a valid create reply passes through with schema_version added and task trimmed', () => {
  const out = normalize(JSON.stringify(modelCreate({ task: '  call mom  ' })), { referenceMs: REF });
  assert.deepEqual(out, { schema_version: '1.0', ...modelCreate() });
});

test('GR-06: a model refusal becomes exactly the fixed refusal shape (task and question discarded)', () => {
  const r = {
    intent: 'clarify',
    status: 'refused',
    reason: 'guardrail_harmful',
    task: 'x',
    datetime: null,
    snooze_minutes: null,
    clarification_question: 'custom',
  };
  assert.deepEqual(normalize(JSON.stringify(r), { referenceMs: REF }), refusalOutput('guardrail_harmful'));
});

test('FR-14: a clarify reply carrying a datetime or snooze value is invalid, not silently nulled', () => {
  const base = {
    intent: 'clarify',
    status: 'needs_clarification',
    task: 'buy groceries',
    datetime: null,
    snooze_minutes: null,
    clarification_question: 'When?',
    reason: 'missing_time',
  };
  for (const bad of [{ datetime: '2026-11-13T17:00:00+05:30' }, { snooze_minutes: 10 }]) {
    assert.deepEqual(
      normalize(JSON.stringify({ ...base, ...bad }), { referenceMs: REF }),
      errorOutput('invalid_model_output'),
    );
  }
});

// ---------------------------------------------------------------- US1 section

test('FR-18: create 1 s before the reference time → past_time; equal instant → create', () => {
  const past = normalize(JSON.stringify(modelCreate({ datetime: '2026-11-12T09:59:59+05:30' })), { referenceMs: REF });
  assert.deepEqual(past, clarifyOutput('past_time', 'call mom', PAST_TIME_QUESTION));
  assert.deepEqual(validateOutput(past, REF), []);
  const equal = normalize(JSON.stringify(modelCreate({ datetime: '2026-11-12T10:00:00+05:30' })), { referenceMs: REF });
  assert.deepEqual(equal, { schema_version: '1.0', ...modelCreate({ datetime: '2026-11-12T10:00:00+05:30' }) });
});

// ---------------------------------------------------------------- US4 section

function modelSnooze(minutes, task = null) {
  return {
    intent: 'snooze',
    status: 'ok',
    task,
    datetime: null,
    snooze_minutes: minutes,
    clarification_question: null,
    reason: null,
  };
}

test('FR-13: fractional snooze minutes are rounded up; 1440 is the inclusive bound', () => {
  for (const [given, expected] of [
    [1.5, 2],
    [0.5, 1],
    [1440, 1440],
  ]) {
    const out = normalize(JSON.stringify(modelSnooze(given)), { referenceMs: REF });
    assert.deepEqual(out, { schema_version: '1.0', ...modelSnooze(expected) }, String(given));
  }
});

test('FR-13: rounded snooze outside 1–1440 → clarify / out_of_range', () => {
  for (const given of [1440.5, 0, -5, 2880]) {
    const out = normalize(JSON.stringify(modelSnooze(given)), { referenceMs: REF });
    assert.deepEqual(out, clarifyOutput('out_of_range', null, OUT_OF_RANGE_QUESTION), String(given));
  }
});

test('FR-13: snooze_minutes as a string or null → invalid_model_output', () => {
  for (const given of ['15', null]) {
    const out = normalize(JSON.stringify(modelSnooze(given)), { referenceMs: REF });
    assert.deepEqual(out, errorOutput('invalid_model_output'), String(given));
  }
});

test('INV-10: reschedule 1 s before the reference time → past_time keeping the task; equal instant → reschedule', () => {
  const r = modelCreate({ intent: 'reschedule', task: 'dentist appointment', datetime: '2026-11-12T09:59:59+05:30' });
  assert.deepEqual(
    normalize(JSON.stringify(r), { referenceMs: REF }),
    clarifyOutput('past_time', 'dentist appointment', PAST_TIME_QUESTION),
  );
  const ok = { ...r, datetime: '2026-11-12T10:00:00+05:30' };
  assert.deepEqual(normalize(JSON.stringify(ok), { referenceMs: REF }), { schema_version: '1.0', ...ok });
});
