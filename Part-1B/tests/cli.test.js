import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.js';
import { createStdin, createSink } from './fakes/fake-streams.js';
import { createFakeModel, reply } from './fakes/fake-model.js';

const ENV = { GEMINI_API_KEY: 'test-key-not-real' };
const ARGV = ['--reference-time', '2026-11-12T10:00:00+05:30'];
const VALID_MSG = 'Remind me to call mom tomorrow at 5pm';
const CREATE = {
  intent: 'create',
  status: 'ok',
  task: 'call mom',
  datetime: '2026-11-13T17:00:00+05:30',
  snooze_minutes: null,
  clarification_question: null,
  reason: null,
};
const noSleep = async () => {};

async function run({ input = VALID_MSG, argv = ARGV, env = ENV, results = [] } = {}) {
  const stdout = createSink();
  const stderr = createSink();
  const modelClient = createFakeModel(results);
  const code = await main({ argv, stdin: createStdin(input), stdout, stderr, env, modelClient, sleep: noSleep });
  const lines = stderr.text.split('\n').filter((l) => l !== '');
  const diagLine = lines[lines.length - 1];
  return { code, stdout: stdout.text, stderr: stderr.text, diagLine, modelClient, output: JSON.parse(stdout.text) };
}

test('FR-01: stdout is exactly one JSON object plus newline; stderr ends with the AGENT_DIAG line', async () => {
  const r = await run({ results: [reply(CREATE)] });
  assert.equal(r.stdout, JSON.stringify(r.output) + '\n');
  assert.equal(typeof r.output, 'object');
  assert.ok(r.output !== null && !Array.isArray(r.output));
  assert.ok(r.diagLine.startsWith('AGENT_DIAG '));
  const diag = JSON.parse(r.diagLine.slice('AGENT_DIAG '.length));
  assert.deepEqual(Object.keys(diag).sort(), ['attempts', 'failure_kind', 'http_status', 'model']);
});

test('INV-01: output is a plain object, never an array or multiple objects', async () => {
  const r = await run({ results: [reply(CREATE)] });
  assert.equal(r.stdout.trimEnd().split('\n').length, 1);
  assert.equal(Object.getPrototypeOf(r.output), Object.prototype);
});

test('AC-24: env without GEMINI_API_KEY → configuration_error, exit 2, no model call, stderr names the variable', async () => {
  for (const input of ['', 'hello', VALID_MSG]) {
    const r = await run({ input, env: {}, results: [reply(CREATE)] });
    assert.equal(r.code, 2, input);
    assert.equal(r.output.status, 'error');
    assert.equal(r.output.reason, 'configuration_error');
    assert.ok(r.stderr.includes('GEMINI_API_KEY'));
    assert.equal(r.modelClient.calls.length, 0);
    const diag = JSON.parse(r.diagLine.slice('AGENT_DIAG '.length));
    assert.equal(diag.attempts, 0);
  }
});

test('FR-05: reference time without offset, unsupported timezone, unknown flag → exit 2 configuration_error', async () => {
  for (const argv of [
    ['--reference-time', '2026-11-12T10:00:00'],
    ['--reference-time', '2026-11-12T10:00:00+05:30', '--timezone', 'Europe/London'],
    ['--foo'],
  ]) {
    const r = await run({ argv, results: [reply(CREATE)] });
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.output.reason, 'configuration_error');
    assert.equal(r.modelClient.calls.length, 0);
  }
});

test('FR-07: model configuration_error → exit 2', async () => {
  const r = await run({
    results: [{ outcome: 'configuration_error', text: null, safetyBlocked: false, attempts: 1, failureKind: null, httpStatus: 401 }],
  });
  assert.equal(r.code, 2);
  assert.equal(r.output.reason, 'configuration_error');
});

test('AC-25: model_service_failure (3 attempts, timeout) → exit 3 and diag failure_kind timeout', async () => {
  const r = await run({
    results: [{ outcome: 'model_service_failure', text: null, safetyBlocked: false, attempts: 3, failureKind: 'timeout', httpStatus: null }],
  });
  assert.equal(r.code, 3);
  assert.equal(r.output.reason, 'model_service_failure');
  const diag = JSON.parse(r.diagLine.slice('AGENT_DIAG '.length));
  assert.equal(diag.failure_kind, 'timeout');
  assert.equal(diag.attempts, 3);
});

test('FR-07: non-JSON reply → exit 1 invalid_model_output; valid create → exit 0', async () => {
  const bad = await run({
    results: [{ outcome: 'reply', text: 'not json', safetyBlocked: false, attempts: 1, failureKind: null, httpStatus: 200 }],
  });
  assert.equal(bad.code, 1);
  assert.equal(bad.output.reason, 'invalid_model_output');
  const good = await run({ results: [reply(CREATE)] });
  assert.equal(good.code, 0);
  assert.deepEqual(good.output, { schema_version: '1.0', ...CREATE });
});
