import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, resolveConfig, DEFAULT_MODEL } from '../src/config.js';
import { parseReferenceTime } from '../src/time.js';

const REF_STR = '2026-11-12T10:00:00+05:30';
const KEY = 'test-key-not-real';

test('FR-05: parseArgs with no flags gives defaults', () => {
  assert.deepEqual(parseArgs([]), { ok: true, referenceTime: null, timezone: 'Asia/Kolkata' });
});

test('FR-05: --reference-time X and --reference-time=X both work', () => {
  assert.equal(parseArgs(['--reference-time', REF_STR]).referenceTime, REF_STR);
  assert.equal(parseArgs([`--reference-time=${REF_STR}`]).referenceTime, REF_STR);
  assert.equal(parseArgs(['--timezone=Asia/Kolkata']).timezone, 'Asia/Kolkata');
});

test('FR-05: missing value, unknown flag, duplicate flag, unsupported timezone are rejected', () => {
  assert.equal(parseArgs(['--reference-time']).ok, false);
  assert.equal(parseArgs(['--foo']).ok, false);
  assert.equal(parseArgs(['--reference-time', REF_STR, '--reference-time', REF_STR]).ok, false);
  const tz = resolveConfig({ argv: ['--timezone', 'Europe/London'], env: { GEMINI_API_KEY: KEY }, nowMs: 0 });
  assert.equal(tz.ok, false);
});

test('FR-03: missing or empty key → not ok, fixed problem text, no env value leaked', () => {
  for (const env of [{}, { GEMINI_API_KEY: '' }]) {
    const r = resolveConfig({ argv: [], env: { ...env, OTHER_VAR: 'other-env-value' }, nowMs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.problem, 'GEMINI_API_KEY is not set');
    assert.ok(!JSON.stringify(r).includes('other-env-value'));
    assert.equal(r.apiKey, undefined);
  }
});

test('FR-03: a config failure never contains the key value', () => {
  const r = resolveConfig({ argv: ['--foo'], env: { GEMINI_API_KEY: KEY }, nowMs: 0 });
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('FR-04: GEMINI_MODEL unset or empty → default; set → that value', () => {
  assert.equal(DEFAULT_MODEL, 'gemini-3.8-flash');
  assert.equal(resolveConfig({ argv: [], env: { GEMINI_API_KEY: KEY }, nowMs: 0 }).model, 'gemini-3.8-flash');
  assert.equal(
    resolveConfig({ argv: [], env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: '' }, nowMs: 0 }).model,
    'gemini-3.8-flash',
  );
  assert.equal(
    resolveConfig({ argv: [], env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: 'other-model' }, nowMs: 0 }).model,
    'other-model',
  );
});

test('FR-05: no reference time → injected nowMs; given → parsed instant', () => {
  const r = resolveConfig({ argv: [], env: { GEMINI_API_KEY: KEY }, nowMs: 123456 });
  assert.equal(r.ok, true);
  assert.equal(r.referenceMs, 123456);
  assert.equal(r.apiKey, KEY);
  const r2 = resolveConfig({ argv: ['--reference-time', REF_STR], env: { GEMINI_API_KEY: KEY }, nowMs: 0 });
  assert.equal(r2.referenceMs, parseReferenceTime(REF_STR).ms);
});

test('FR-05: reference time without offset → not ok', () => {
  const r = resolveConfig({ argv: ['--reference-time', '2026-11-12T10:00:00'], env: { GEMINI_API_KEY: KEY }, nowMs: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.problem, 'invalid --reference-time (offset required)');
});
