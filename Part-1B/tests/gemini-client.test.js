import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiClient } from '../src/gemini-client.js';
import { createFakeFetch, geminiBody } from './fakes/fake-fetch.js';

const KEY = 'test-key-not-real';
const NOW = Date.UTC(2026, 10, 12, 4, 30, 0);
const OK_REPLY = { intent: 'snooze', status: 'ok', task: null, datetime: null, snooze_minutes: 10, clarification_question: null, reason: null };

function setup(steps, extra = {}) {
  const fetch = createFakeFetch(steps);
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
  };
  const client = createGeminiClient({ apiKey: KEY, model: 'gemini-3.8-flash', fetch, sleep, now: () => NOW, ...extra });
  return { fetch, waits, client };
}

const BODY = { contents: [] };

test('FR-38: 429 → 429 → 200 succeeds after 3 attempts with waits [2000, 5000]', async () => {
  const { client, waits } = setup([{ status: 429 }, { status: 429 }, { status: 200, json: geminiBody(OK_REPLY) }]);
  const r = await client.generate(BODY);
  assert.equal(r.outcome, 'reply');
  assert.equal(r.attempts, 3);
  assert.deepEqual(waits, [2000, 5000]);
  assert.deepEqual(JSON.parse(r.text), OK_REPLY);
});

test('FR-38: Retry-After: 7 → wait 7000 ms', async () => {
  const { client, waits } = setup([{ status: 429, headers: { 'Retry-After': '7' } }, { status: 200, json: geminiBody(OK_REPLY) }]);
  await client.generate(BODY);
  assert.deepEqual(waits, [7000]);
});

test('FR-38: Retry-After: 120 is capped at 30000 ms', async () => {
  const { client, waits } = setup([{ status: 503, headers: { 'Retry-After': '120' } }, { status: 200, json: geminiBody(OK_REPLY) }]);
  await client.generate(BODY);
  assert.deepEqual(waits, [30000]);
});

test('FR-38: Retry-After as HTTP-date 10 s ahead of now → wait 10000 ms', async () => {
  const date = new Date(NOW + 10000).toUTCString();
  const { client, waits } = setup([{ status: 429, headers: { 'Retry-After': date } }, { status: 200, json: geminiBody(OK_REPLY) }]);
  await client.generate(BODY);
  assert.deepEqual(waits, [10000]);
});

test('FR-38: 503 × 3 → model_service_failure, failureKind 5xx', async () => {
  const { client } = setup([{ status: 503 }, { status: 503 }, { status: 503 }]);
  const r = await client.generate(BODY);
  assert.equal(r.outcome, 'model_service_failure');
  assert.equal(r.failureKind, '5xx');
  assert.equal(r.attempts, 3);
  assert.equal(r.httpStatus, 503);
});

test('FR-38: thrown TypeError × 3 → model_service_failure, failureKind network', async () => {
  const err = () => ({ throws: new TypeError('fetch failed') });
  const { client } = setup([err(), err(), err()]);
  const r = await client.generate(BODY);
  assert.equal(r.outcome, 'model_service_failure');
  assert.equal(r.failureKind, 'network');
  assert.equal(r.attempts, 3);
});

test('FR-36: 408 × 3 → model_service_failure, failureKind timeout, 3 attempts', async () => {
  const { client } = setup([{ status: 408 }, { status: 408 }, { status: 408 }]);
  const r = await client.generate(BODY);
  assert.equal(r.outcome, 'model_service_failure');
  assert.equal(r.failureKind, 'timeout');
  assert.equal(r.attempts, 3);
});

test('FR-36: 401, 400, 403, 404, 422 → configuration_error after 1 attempt, no sleep', async () => {
  for (const status of [401, 400, 403, 404, 422]) {
    const { client, waits, fetch } = setup([{ status }]);
    const r = await client.generate(BODY);
    assert.equal(r.outcome, 'configuration_error', String(status));
    assert.equal(r.attempts, 1);
    assert.equal(r.httpStatus, status);
    assert.deepEqual(waits, []);
    assert.equal(fetch.calls.length, 1);
  }
});

test('AC-25: three TimeoutError rejections → model_service_failure timeout; every call has an AbortSignal', async () => {
  const t = () => ({ throws: new DOMException('The operation timed out.', 'TimeoutError') });
  const { client, fetch } = setup([t(), t(), t()]);
  const r = await client.generate(BODY);
  assert.equal(r.outcome, 'model_service_failure');
  assert.equal(r.failureKind, 'timeout');
  assert.equal(r.attempts, 3);
  assert.equal(fetch.calls.length, 3);
  for (const c of fetch.calls) {
    assert.ok(c.init.signal instanceof AbortSignal);
  }
});

test('GR-08: URL has no key; key only in x-goog-api-key header; result never contains the key', async () => {
  const { client, fetch } = setup([{ status: 200, json: geminiBody(OK_REPLY) }]);
  const r = await client.generate(BODY);
  const call = fetch.calls[0];
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.ok(!call.url.includes(KEY));
  assert.equal(call.init.headers['x-goog-api-key'], KEY);
  assert.equal(call.init.method, 'POST');
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('GR-08: failure results never contain the key', async () => {
  const { client } = setup([{ status: 401 }]);
  const r = await client.generate(BODY);
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('R-09: promptFeedback.blockReason → safetyBlocked', async () => {
  const { client } = setup([{ status: 200, json: { promptFeedback: { blockReason: 'SAFETY' } } }]);
  const r = await client.generate(BODY);
  assert.equal(r.outcome, 'reply');
  assert.equal(r.safetyBlocked, true);
});

test('R-09: finishReason SAFETY / PROHIBITED_CONTENT / BLOCKLIST → safetyBlocked', async () => {
  for (const finishReason of ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST']) {
    const { client } = setup([{ status: 200, json: { candidates: [{ finishReason }] } }]);
    const r = await client.generate(BODY);
    assert.equal(r.safetyBlocked, true, finishReason);
  }
});

test('R-09: reply text is the concatenation of candidates[0].content.parts[*].text', async () => {
  const body = { candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] }, finishReason: 'STOP' }] };
  const { client } = setup([{ status: 200, json: body }]);
  const r = await client.generate(BODY);
  assert.equal(r.text, '{"a":1}');
  assert.equal(r.safetyBlocked, false);
});

test('R-09: 200 with no candidates → reply with text null', async () => {
  const { client } = setup([{ status: 200, json: {} }]);
  const r = await client.generate(BODY);
  assert.equal(r.outcome, 'reply');
  assert.equal(r.text, null);
  assert.equal(r.safetyBlocked, false);
});
