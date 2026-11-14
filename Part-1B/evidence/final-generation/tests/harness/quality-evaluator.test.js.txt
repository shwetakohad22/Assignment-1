import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, taskScore, timeScore, semanticScore } from '../../.harness/evaluators/quality.js';

const EV01_KEYWORDS = ['call', ['mom', 'mother', 'mum']];
const EV01_EXPECTED = {
  intent: 'create',
  status: 'ok',
  reason: null,
  task_keywords: EV01_KEYWORDS,
  datetime: '2026-11-13T17:00:00+05:30',
  snooze_minutes: null,
};

function out(fields) {
  return { task: null, datetime: null, snooze_minutes: null, ...fields };
}

test('FR-26: normalise applies NFKC, lower-case, non-alphanumerics → space, collapse, trim', () => {
  assert.equal(normalise('  Call   MOM! '), 'call mom');
  assert.equal(normalise('ｃａｌｌ'), 'call');
  assert.equal(normalise('pay-the_bill.'), 'pay the bill');
});

test('FR-27: worked example rows (Call Mom → 0.5, Phone mother → 0)', () => {
  assert.equal(taskScore('Call Mom', EV01_KEYWORDS), 0.5);
  assert.equal(taskScore('Phone mother', EV01_KEYWORDS), 0);
});

test('FR-27: a synonym list matches when any synonym matches', () => {
  assert.equal(taskScore('call my mother', EV01_KEYWORDS), 0.5);
  assert.equal(taskScore('call mum', EV01_KEYWORDS), 0.5);
});

test('FR-27: keywords match on word boundaries only ("call" does not match "recall mom")', () => {
  assert.equal(taskScore('recall mom', EV01_KEYWORDS), 0);
  assert.equal(taskScore('pay the electricity bill', ['electricity bill']), 0.5);
});

test('FR-27: null task with keywords scores 0; expected null scores 0.5 only for a null task', () => {
  assert.equal(taskScore(null, EV01_KEYWORDS), 0);
  assert.equal(taskScore(null, null), 0.5);
  assert.equal(taskScore('x', null), 0);
});

test('FR-28: same instant in +05:30 → 0.5; a different instant → 0', () => {
  assert.equal(timeScore(out({ datetime: '2026-11-13T17:00:00+05:30' }), EV01_EXPECTED), 0.5);
  assert.equal(timeScore(out({ datetime: '2026-11-13T05:00:00+05:30' }), EV01_EXPECTED), 0);
});

test('FR-28: the same instant written with Z scores 0 (offset must be +05:30)', () => {
  assert.equal(timeScore(out({ datetime: '2026-11-13T11:30:00Z' }), EV01_EXPECTED), 0);
});

test('FR-28: snooze minutes must match exactly', () => {
  const expected = { ...EV01_EXPECTED, datetime: null, snooze_minutes: 15 };
  assert.equal(timeScore(out({ snooze_minutes: 15 }), expected), 0.5);
  assert.equal(timeScore(out({ snooze_minutes: 16 }), expected), 0);
});

test('FR-28: both expected values null → 0.5 only when datetime and snooze_minutes are both null', () => {
  const expected = { ...EV01_EXPECTED, datetime: null, snooze_minutes: null };
  assert.equal(timeScore(out({}), expected), 0.5);
  assert.equal(timeScore(out({ snooze_minutes: 10 }), expected), 0);
  assert.equal(timeScore(out({ datetime: '2026-11-13T17:00:00+05:30' }), expected), 0);
});

test('FR-29: semantic score is task + time and is always 0, 0.5 or 1', () => {
  assert.equal(semanticScore(out({ task: 'Call Mom', datetime: '2026-11-13T17:00:00+05:30' }), EV01_EXPECTED), 1);
  assert.equal(semanticScore(out({ task: 'Call Mom', datetime: '2026-11-13T05:00:00+05:30' }), EV01_EXPECTED), 0.5);
  assert.equal(semanticScore(out({ task: 'Phone mother', datetime: '2026-11-13T05:00:00+05:30' }), EV01_EXPECTED), 0);
  for (const task of ['Call Mom', 'Phone mother', null]) {
    for (const datetime of ['2026-11-13T17:00:00+05:30', null]) {
      assert.ok([0, 0.5, 1].includes(semanticScore(out({ task, datetime }), EV01_EXPECTED)));
    }
  }
});
