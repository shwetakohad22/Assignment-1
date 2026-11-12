import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRun } from '../../.harness/lib/classify.js';
import { parseDiag } from '../../.harness/lib/diag.js';

function errorShape(reason) {
  return {
    schema_version: '1.0',
    intent: 'clarify',
    status: 'error',
    task: null,
    datetime: null,
    snooze_minutes: null,
    clarification_question: 'Something went wrong while processing your reminder. Please try again.',
    reason,
  };
}

const NORMAL = {
  schema_version: '1.0',
  intent: 'create',
  status: 'ok',
  task: 'call mom',
  datetime: '2026-11-13T17:00:00+05:30',
  snooze_minutes: null,
  clarification_question: null,
  reason: null,
};

test('CHK-SVC: exit 2 or reason configuration_error → CONFIG_ERROR', () => {
  assert.equal(classifyRun({ exitCode: 2, parsed: null, diag: null }), 'CONFIG_ERROR');
  assert.equal(classifyRun({ exitCode: 0, parsed: errorShape('configuration_error'), diag: null }), 'CONFIG_ERROR');
});

test('FR-36: exit 3 or reason model_service_failure → SERVICE_FAILURE, failure_kind from the diag', () => {
  const diag = parseDiag('AGENT_DIAG {"attempts":3,"failure_kind":"429","http_status":429,"model":"m"}\n');
  assert.equal(classifyRun({ exitCode: 3, parsed: errorShape('model_service_failure'), diag }), 'SERVICE_FAILURE');
  assert.equal(classifyRun({ exitCode: 3, parsed: null, diag }), 'SERVICE_FAILURE');
  assert.equal(classifyRun({ exitCode: 0, parsed: errorShape('model_service_failure'), diag }), 'SERVICE_FAILURE');
  assert.equal(diag.failure_kind, '429');
  assert.equal(diag.attempts, 3);
});

test('FR-36: normal output with exit 0, exit 1, and a timeout with empty stdout → EVALUATED', () => {
  assert.equal(classifyRun({ exitCode: 0, parsed: NORMAL, diag: null }), 'EVALUATED');
  assert.equal(classifyRun({ exitCode: 1, parsed: errorShape('invalid_model_output'), diag: null }), 'EVALUATED');
  assert.equal(classifyRun({ exitCode: null, parsed: null, diag: null }), 'EVALUATED');
});

test('CHK-SVC: CONFIG_ERROR is checked before SERVICE_FAILURE', () => {
  assert.equal(classifyRun({ exitCode: 2, parsed: errorShape('model_service_failure'), diag: null }), 'CONFIG_ERROR');
  assert.equal(classifyRun({ exitCode: 3, parsed: errorShape('configuration_error'), diag: null }), 'CONFIG_ERROR');
});

test('CHK-SVC: parseDiag keeps only the allowed fields of the last AGENT_DIAG line', () => {
  const stderr =
    'GEMINI_API_KEY is not set\n' +
    'AGENT_DIAG {"attempts":1,"failure_kind":null,"http_status":200,"model":"a"}\n' +
    'AGENT_DIAG {"attempts":2,"failure_kind":"5xx","http_status":503,"model":"b","extra":"dropped"}\n';
  assert.deepEqual(parseDiag(stderr), { attempts: 2, failure_kind: '5xx', http_status: 503, model: 'b' });
  assert.equal(parseDiag(''), null);
  assert.equal(parseDiag('AGENT_DIAG not-json\n'), null);
});
