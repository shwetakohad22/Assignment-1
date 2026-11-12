// CHK-DATA: dataset validation (FR-20 to FR-23). Returns error strings; [] means valid.
import { isDeepStrictEqual } from 'node:util';
import { toDatasetForm } from '../threshold.js';
import { extractSpecIds, extractSpecVersion } from './spec-ids.js';

const REFERENCE_TIME = '2026-11-12T10:00:00+05:30';
const TIMEZONE = 'Asia/Kolkata';
const MIN_CASES = 15;
const V1_CASES = 25;
const CATEGORIES = Object.freeze(['normal', 'boundary', 'ambiguous', 'missing_info', 'malformed', 'adversarial']);
const INTENTS = Object.freeze(['create', 'reschedule', 'snooze', 'clarify']);
const STATUSES = Object.freeze(['ok', 'needs_clarification', 'refused', 'error']);
const REASONS = Object.freeze([
  'missing_task',
  'missing_time',
  'ambiguous_time',
  'ambiguous_request',
  'past_time',
  'out_of_range',
  'malformed_input',
  'guardrail_injection',
  'guardrail_secret_request',
  'guardrail_harmful',
  'invalid_model_output',
  'model_service_failure',
  'configuration_error',
]);
const IST_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

function validateExpected(id, e, errors) {
  if (!isObject(e)) {
    errors.push(`${id}: expected must be an object`);
    return;
  }
  if (!INTENTS.includes(e.intent)) errors.push(`${id}: expected.intent must be one allowed value`);
  if (!STATUSES.includes(e.status)) errors.push(`${id}: expected.status must be one allowed value`);
  if (!(e.reason === null || (isStringArray(e.reason) && e.reason.length > 0 && e.reason.every((r) => REASONS.includes(r))))) {
    errors.push(`${id}: expected.reason must be string[] | null`);
  }
  const kwOk =
    e.task_keywords === null ||
    (Array.isArray(e.task_keywords) &&
      e.task_keywords.length > 0 &&
      e.task_keywords.every((k) => typeof k === 'string' || (isStringArray(k) && k.length > 0)));
  if (!kwOk) errors.push(`${id}: expected.task_keywords must be (string | string[])[] | null`);
  if (!(e.datetime === null || (typeof e.datetime === 'string' && IST_RE.test(e.datetime)))) {
    errors.push(`${id}: expected.datetime must be a +05:30 ISO string or null`);
  }
  if (!(e.snooze_minutes === null || Number.isInteger(e.snooze_minutes))) {
    errors.push(`${id}: expected.snooze_minutes must be an integer or null`);
  }
}

export function validateDataset(dataset, specText) {
  const errors = [];
  if (!isObject(dataset)) return ['dataset must be a JSON object'];

  if (dataset.dataset_version !== '1.0') errors.push('dataset_version must be "1.0"');
  const specVersion = extractSpecVersion(specText);
  if (specVersion === null) errors.push('spec.md has no "**Spec Version**: X.Y" header line');
  if (typeof dataset.spec_version !== 'string') {
    errors.push('spec_version is missing or not a string');
  } else if (dataset.spec_version !== specVersion) {
    errors.push(`spec_version ${dataset.spec_version} differs from the spec header version ${specVersion}`);
  }
  if (dataset.reference_time !== REFERENCE_TIME) errors.push(`reference_time must be ${REFERENCE_TIME}`);
  if (dataset.timezone !== TIMEZONE) errors.push(`timezone must be ${TIMEZONE}`);
  if (!isDeepStrictEqual(dataset.threshold, toDatasetForm())) errors.push('threshold differs from the declared FR-32 to FR-35 values');

  if (!Array.isArray(dataset.cases)) {
    errors.push('cases must be an array');
    return errors;
  }
  const cases = dataset.cases;
  if (cases.length < MIN_CASES) errors.push(`cases: at least ${MIN_CASES} required, found ${cases.length}`);
  if (dataset.dataset_version === '1.0' && cases.length !== V1_CASES) {
    errors.push(`cases: dataset v1.0 must have exactly ${V1_CASES} cases, found ${cases.length}`);
  }

  const specIds = extractSpecIds(specText);
  const seen = new Set();
  const categories = new Set();
  cases.forEach((c, i) => {
    if (!isObject(c)) {
      errors.push(`cases[${i}] must be an object`);
      return;
    }
    const id = typeof c.id === 'string' ? c.id : `cases[${i}]`;
    if (typeof c.id !== 'string' || !/^EV-\d{2}$/.test(c.id)) errors.push(`${id}: id must match EV-nn`);
    if (seen.has(c.id)) errors.push(`${id}: duplicate id`);
    seen.add(c.id);
    if (!CATEGORIES.includes(c.category)) {
      errors.push(`${id}: unknown category`);
    } else {
      categories.add(c.category);
    }
    if (typeof c.guardrail !== 'boolean') errors.push(`${id}: guardrail must be a boolean`);
    if (c.category === 'adversarial' && c.guardrail !== true) errors.push(`${id}: adversarial case must have guardrail true`);
    if (typeof c.input !== 'string') errors.push(`${id}: input must be a string`);
    validateExpected(id, c.expected, errors);
    if (!isStringArray(c.traces_to) || c.traces_to.length === 0) {
      errors.push(`${id}: traces_to must be a non-empty list`);
    } else {
      for (const t of c.traces_to) {
        if (!specIds.has(t)) errors.push(`${id}: traces_to ID ${t} is not defined in spec.md`);
      }
    }
  });
  for (const cat of CATEGORIES) {
    if (!categories.has(cat)) errors.push(`category ${cat} is not covered`);
  }
  return errors;
}
