import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReferenceTime,
  isValidIstDatetime,
  weekdayIst,
  calendarHint,
  formatIst,
  istToMs,
} from '../src/time.js';

test('FR-05: Z and +05:30 forms of the same instant parse to the same ms and IST string', () => {
  const a = parseReferenceTime('2026-11-12T04:30:00Z');
  const b = parseReferenceTime('2026-11-12T10:00:00+05:30');
  assert.ok(a && b);
  assert.equal(a.ms, b.ms);
  assert.equal(a.ist, '2026-11-12T10:00:00+05:30');
  assert.equal(b.ist, '2026-11-12T10:00:00+05:30');
});

test('FR-05: reference time without offset or with an impossible value is rejected', () => {
  for (const bad of [
    '2026-11-12T10:00:00',
    '2026-11-31T10:00:00+05:30',
    '2026-11-12T24:00:00+05:30',
    'garbage',
  ]) {
    assert.equal(parseReferenceTime(bad), null, bad);
  }
});

test('INV-06: isValidIstDatetime accepts a real +05:30 date-time', () => {
  assert.equal(isValidIstDatetime('2026-11-13T17:00:00+05:30'), true);
});

test('INV-06: isValidIstDatetime rejects 31 Nov, hour 24, other offsets and missing seconds', () => {
  for (const bad of [
    '2026-11-31T10:00:00+05:30',
    '2026-11-12T24:00:00+05:30',
    '2026-11-12T10:00:00+00:00',
    '2026-11-12T10:00+05:30',
  ]) {
    assert.equal(isValidIstDatetime(bad), false, bad);
  }
});

test('FR-17: reference 2026-11-12T10:00:00+05:30 is a Thursday', () => {
  const ref = parseReferenceTime('2026-11-12T10:00:00+05:30').ms;
  assert.equal(weekdayIst(ref), 'Thursday');
});

test('FR-17: calendar hint lists the 14 days after the reference date', () => {
  const ref = parseReferenceTime('2026-11-12T10:00:00+05:30').ms;
  const cal = calendarHint(ref);
  assert.equal(cal.length, 14);
  assert.equal(cal[0], '2026-11-13 Friday');
  assert.ok(cal.includes('2026-11-16 Monday'));
  assert.ok(cal.includes('2026-11-19 Thursday'));
});

test('FR-17: formatIst(istToMs(x)) round-trips', () => {
  const x = '2026-11-13T17:00:00+05:30';
  assert.equal(formatIst(istToMs(x)), x);
});
