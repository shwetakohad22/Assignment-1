import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDataset } from '../../.harness/lib/dataset.js';
import { extractSpecIds, extractSpecVersion } from '../../.harness/lib/spec-ids.js';
import { THRESHOLD, toDatasetForm } from '../../.harness/threshold.js';

const DATASET = JSON.parse(fs.readFileSync(new URL('../../evals/dataset.json', import.meta.url), 'utf8'));
const SPEC = fs.readFileSync(new URL('../../specs/001-nl-reminder-agent/spec.md', import.meta.url), 'utf8');

function fixture(change) {
  const d = structuredClone(DATASET);
  change(d);
  return d;
}

test('FR-22: real dataset has 25 cases with the declared category counts', () => {
  assert.equal(DATASET.cases.length, 25);
  const counts = {};
  for (const c of DATASET.cases) counts[c.category] = (counts[c.category] ?? 0) + 1;
  assert.deepEqual(counts, { normal: 8, boundary: 5, missing_info: 2, ambiguous: 2, malformed: 3, adversarial: 5 });
});

test('FR-22: EV-20 input is 1,200 characters and EV-18 input is empty', () => {
  const byId = Object.fromEntries(DATASET.cases.map((c) => [c.id, c]));
  assert.equal(byId['EV-20'].input.length, 1200);
  assert.equal(byId['EV-18'].input, '');
});

test('CHK-DATA: FR-23 the real dataset validates against the real spec', () => {
  assert.deepEqual(validateDataset(DATASET, SPEC), []);
});

const BAD_FIXTURES = [
  ['only 14 cases', (d) => (d.cases = d.cases.slice(0, 14))],
  ['a category missing', (d) => (d.cases = d.cases.filter((c) => c.category !== 'ambiguous'))],
  ['duplicate ID', (d) => (d.cases[1].id = 'EV-01')],
  ['unknown traces_to ID', (d) => (d.cases[0].traces_to = ['FR-99'])],
  ['empty traces_to', (d) => (d.cases[0].traces_to = [])],
  ['adversarial with guardrail false', (d) => (d.cases[24].guardrail = false)],
  ['wrong reference_time', (d) => (d.reference_time = '2026-11-12T11:00:00+05:30')],
  ['wrong timezone', (d) => (d.timezone = 'UTC')],
  ['threshold.overall 0.7', (d) => (d.threshold.overall = 0.7)],
  ['expected.reason as a string', (d) => (d.cases[12].expected.reason = 'past_time')],
  ['spec_version 1.2', (d) => (d.spec_version = '1.2')],
  ['spec_version 1.3', (d) => (d.spec_version = '1.3')],
  ['spec_version missing', (d) => delete d.spec_version],
];

for (const [name, change] of BAD_FIXTURES) {
  test(`AC-19: invalid dataset (${name}) → validation errors`, () => {
    const errors = validateDataset(fixture(change), SPEC);
    assert.ok(Array.isArray(errors));
    assert.ok(errors.length > 0, name);
  });
}

test('FR-20: extractSpecVersion reads 1.4 from the spec header and equals the dataset spec_version', () => {
  assert.equal(extractSpecVersion(SPEC), '1.4');
  assert.equal(DATASET.spec_version, extractSpecVersion(SPEC));
  assert.equal(extractSpecVersion('no version line here'), null);
});

test('FR-35: THRESHOLD equals the dataset threshold and the spec declares 0.8 / 0.80', () => {
  assert.deepEqual(toDatasetForm(), DATASET.threshold);
  assert.deepEqual({ ...THRESHOLD }, { caseSemantic: 0.8, overall: 0.8, allGuardrailMustPass: true });
  assert.ok(SPEC.includes('≥ **0.8**'));
  assert.ok(SPEC.includes('≥ **0.80**'));
});

test('FR-42: extractSpecIds finds FR-16h, INV-13, BP-08, GR-07 and AC-25', () => {
  const ids = extractSpecIds(SPEC);
  assert.ok(ids instanceof Set);
  for (const id of ['FR-16h', 'INV-13', 'BP-08', 'GR-07', 'AC-25']) {
    assert.ok(ids.has(id), id);
  }
  assert.ok(!ids.has('FR-99'));
});
