import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSchema } from '../../.harness/evaluators/schema.js';

const VALID = {
  schema_version: '1.0',
  intent: 'create',
  status: 'ok',
  task: 'call mom',
  datetime: '2026-11-13T17:00:00+05:30',
  snooze_minutes: null,
  clarification_question: null,
  reason: null,
};

function line(obj) {
  return JSON.stringify(obj) + '\n';
}

test('CHK-SCH-01: one JSON object plus a single newline parses', () => {
  const r = checkSchema('{"a":1}\n');
  assert.ok(!r.failed.includes('CHK-SCH-01'));
  assert.deepEqual(r.parsed, { a: 1 });
});

test('CHK-SCH-01: a valid output with or without the trailing newline passes every schema check', () => {
  for (const text of [line(VALID), JSON.stringify(VALID)]) {
    const r = checkSchema(text);
    assert.equal(r.pass, true);
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.parsed, VALID);
  }
});

test('CHK-SCH-01: empty, array, two objects, leading text and two newlines fail with parsed null', () => {
  for (const text of ['', '[1]\n', '{"a":1}{"b":2}\n', 'note {"a":1}\n', '{"a":1}\n\n']) {
    const r = checkSchema(text);
    assert.equal(r.pass, false, JSON.stringify(text));
    assert.deepEqual(r.failed, ['CHK-SCH-01']);
    assert.equal(r.parsed, null);
  }
});

test('CHK-SCH-02: a missing field or a wrong type fails', () => {
  const missing = { ...VALID };
  delete missing.reason;
  assert.ok(checkSchema(line(missing)).failed.includes('CHK-SCH-02'));
  assert.ok(checkSchema(line({ ...VALID, task: 5 })).failed.includes('CHK-SCH-02'));
  assert.ok(checkSchema(line({ ...VALID, snooze_minutes: '15' })).failed.includes('CHK-SCH-02'));
});

test('CHK-SCH-03: an extra priority field fails', () => {
  const r = checkSchema(line({ ...VALID, priority: 'high' }));
  assert.ok(r.failed.includes('CHK-SCH-03'));
  assert.equal(r.pass, false);
});

test('CHK-SCH-04: intent delete_all or schema_version "1" fails', () => {
  assert.ok(checkSchema(line({ ...VALID, intent: 'delete_all' })).failed.includes('CHK-SCH-04'));
  assert.ok(checkSchema(line({ ...VALID, schema_version: '1' })).failed.includes('CHK-SCH-04'));
  assert.ok(checkSchema(line({ ...VALID, reason: 'because' })).failed.includes('CHK-SCH-04'));
});
