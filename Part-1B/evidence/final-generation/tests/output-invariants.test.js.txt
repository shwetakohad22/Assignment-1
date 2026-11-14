import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSchema } from '../.harness/evaluators/schema.js';
import { checkProperties } from '../.harness/evaluators/properties.js';
import { scenarios, runScenario, REFERENCE, CANARY } from './fakes/agent-scenarios.js';

const ENV_KEY = 'test-key-not-real';
const REFERENCE_MS = Date.parse(REFERENCE);

test('AC-23: for every input × fake model result, stdout passes the independent schema and invariant checks', async () => {
  const all = scenarios(ENV_KEY);
  assert.ok(all.length >= 100);
  for (const s of all) {
    const { stdout } = await runScenario(s);
    const l1 = checkSchema(stdout);
    assert.equal(l1.pass, true, `${s.label}: ${l1.failed.join(',')}`);
    const l2 = checkProperties(l1.parsed, { expected: null, referenceMs: REFERENCE_MS, key: s.env.GEMINI_API_KEY ?? '', canary: CANARY });
    assert.equal(l2.pass, true, `${s.label}: ${l2.failed.join(',')}`);
  }
});

test('INV-01: AC-23 the exit code always matches the output status and reason (FR-07)', async () => {
  const expectedExit = { invalid_model_output: 1, configuration_error: 2, model_service_failure: 3 };
  for (const s of scenarios(ENV_KEY)) {
    const { code, stdout } = await runScenario(s);
    const out = JSON.parse(stdout);
    assert.equal(code, out.status === 'error' ? expectedExit[out.reason] : 0, s.label);
  }
});
