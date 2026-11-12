// Output contract, schema 1.0 (spec FR-07 to FR-09, INV-02 to INV-13).
import { isValidIstDatetime, istToMs } from './time.js';

export const SCHEMA_VERSION = '1.0';

export const FIELDS = Object.freeze([
  'schema_version',
  'intent',
  'status',
  'task',
  'datetime',
  'snooze_minutes',
  'clarification_question',
  'reason',
]);

export const MODEL_FIELDS = Object.freeze(FIELDS.filter((f) => f !== 'schema_version'));

export const INTENTS = Object.freeze(['create', 'reschedule', 'snooze', 'clarify']);
export const STATUSES = Object.freeze(['ok', 'needs_clarification', 'refused', 'error']);

export const CLARIFY_REASONS = Object.freeze([
  'missing_task',
  'missing_time',
  'ambiguous_time',
  'ambiguous_request',
  'past_time',
  'out_of_range',
  'malformed_input',
]);
export const REFUSAL_REASONS = Object.freeze(['guardrail_injection', 'guardrail_secret_request', 'guardrail_harmful']);
export const ERROR_REASONS = Object.freeze(['invalid_model_output', 'model_service_failure', 'configuration_error']);
export const ALL_REASONS = Object.freeze([...CLARIFY_REASONS, ...REFUSAL_REASONS, ...ERROR_REASONS]);

// Clarification reasons for which a task may be kept (FR-09, BP-03).
const TASK_OPT_CLARIFY_REASONS = Object.freeze(['missing_time', 'ambiguous_time', 'past_time']);

// FR-09 table. "req" = non-null, "null" = must be null, "opt" = either.
// `reasons: null` means reason must be null; `task` may be a function of the reason.
export const ROWS = Object.freeze([
  Object.freeze({ intent: 'create', status: 'ok', task: 'req', datetime: 'req', snooze_minutes: 'null', clarification_question: 'null', reasons: null }),
  Object.freeze({ intent: 'reschedule', status: 'ok', task: 'req', datetime: 'req', snooze_minutes: 'null', clarification_question: 'null', reasons: null }),
  Object.freeze({ intent: 'snooze', status: 'ok', task: 'opt', datetime: 'null', snooze_minutes: 'req', clarification_question: 'null', reasons: null }),
  Object.freeze({
    intent: 'clarify',
    status: 'needs_clarification',
    task: (reason) => (TASK_OPT_CLARIFY_REASONS.includes(reason) ? 'opt' : 'null'),
    datetime: 'null',
    snooze_minutes: 'null',
    clarification_question: 'req',
    reasons: CLARIFY_REASONS,
  }),
  Object.freeze({ intent: 'clarify', status: 'refused', task: 'null', datetime: 'null', snooze_minutes: 'null', clarification_question: 'req', reasons: REFUSAL_REASONS }),
  Object.freeze({ intent: 'clarify', status: 'error', task: 'null', datetime: 'null', snooze_minutes: 'null', clarification_question: 'req', reasons: ERROR_REASONS }),
]);

export const KEY_PATTERN = /AIza[0-9A-Za-z_-]{35}/;

// Fixed messages, verbatim from plan.md "Fixed messages".
export const REFUSAL_MESSAGE =
  'I can\'t help with that request. Please send a normal reminder request, for example: "Remind me to call mom tomorrow at 5pm".';
export const ERROR_MESSAGE = 'Something went wrong while processing your reminder. Please try again.';
export const MALFORMED_QUESTION =
  "I couldn't understand that message. What would you like to be reminded about, and when?";
export const PAST_TIME_QUESTION = 'That time has already passed. When would you like to be reminded instead?';
export const OUT_OF_RANGE_QUESTION =
  'Snooze must be between 1 minute and 24 hours. How long should I snooze it?';

const TASK_MAX = 200;
const QUESTION_MAX = 300;

export function errorOutput(reason) {
  return {
    schema_version: SCHEMA_VERSION,
    intent: 'clarify',
    status: 'error',
    task: null,
    datetime: null,
    snooze_minutes: null,
    clarification_question: ERROR_MESSAGE,
    reason,
  };
}

export function refusalOutput(reason) {
  return {
    schema_version: SCHEMA_VERSION,
    intent: 'clarify',
    status: 'refused',
    task: null,
    datetime: null,
    snooze_minutes: null,
    clarification_question: REFUSAL_MESSAGE,
    reason,
  };
}

export function clarifyOutput(reason, task, question) {
  const taskAllowed = TASK_OPT_CLARIFY_REASONS.includes(reason);
  return {
    schema_version: SCHEMA_VERSION,
    intent: 'clarify',
    status: 'needs_clarification',
    task: taskAllowed ? (task ?? null) : null,
    datetime: null,
    snooze_minutes: null,
    clarification_question: question,
    reason,
  };
}

const EXIT_CODES = Object.freeze({
  invalid_model_output: 1,
  configuration_error: 2,
  model_service_failure: 3,
});

export function exitCodeFor(output) {
  if (output && output.status === 'error') {
    return EXIT_CODES[output.reason] ?? 1;
  }
  return 0;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

const isStrOrNull = (v) => v === null || typeof v === 'string';

function typesOk(obj) {
  return (
    typeof obj.schema_version === 'string' &&
    typeof obj.intent === 'string' &&
    typeof obj.status === 'string' &&
    isStrOrNull(obj.task) &&
    isStrOrNull(obj.datetime) &&
    (obj.snooze_minutes === null || typeof obj.snooze_minutes === 'number') &&
    isStrOrNull(obj.clarification_question) &&
    isStrOrNull(obj.reason)
  );
}

function presenceOk(rule, value) {
  if (rule === 'req') return value !== null && value !== undefined;
  if (rule === 'null') return value === null;
  return true;
}

function matchesRow(obj) {
  return ROWS.some((row) => {
    if (row.intent !== obj.intent || row.status !== obj.status) return false;
    if (row.reasons === null ? obj.reason !== null : !row.reasons.includes(obj.reason)) return false;
    const taskRule = typeof row.task === 'function' ? row.task(obj.reason) : row.task;
    return (
      presenceOk(taskRule, obj.task) &&
      presenceOk(row.datetime, obj.datetime) &&
      presenceOk(row.snooze_minutes, obj.snooze_minutes) &&
      presenceOk(row.clarification_question, obj.clarification_question)
    );
  });
}

function textOk(v, max) {
  return v === null || (typeof v === 'string' && v === v.trim() && v.length >= 1 && v.length <= max);
}

function stringValues(obj) {
  return Object.values(obj).filter((v) => typeof v === 'string');
}

// Returns the sorted list of failed invariant IDs (INV-02 … INV-13); [] means valid.
export function validateOutput(obj, referenceMs, { key, canary } = {}) {
  if (!isPlainObject(obj)) return ['INV-02'];
  const failed = new Set();
  const keys = Object.keys(obj);

  if (!FIELDS.every((f) => Object.prototype.hasOwnProperty.call(obj, f)) || !typesOk(obj)) {
    failed.add('INV-02');
  }
  if (keys.some((k) => !FIELDS.includes(k))) failed.add('INV-03');
  if (
    obj.schema_version !== SCHEMA_VERSION ||
    !INTENTS.includes(obj.intent) ||
    !STATUSES.includes(obj.status) ||
    !(obj.reason === null || ALL_REASONS.includes(obj.reason))
  ) {
    failed.add('INV-04');
  }
  if (!matchesRow(obj)) failed.add('INV-05');

  if (obj.datetime !== null && obj.datetime !== undefined && !isValidIstDatetime(obj.datetime)) {
    failed.add('INV-06');
  }
  if (
    obj.snooze_minutes !== null &&
    obj.snooze_minutes !== undefined &&
    !(Number.isInteger(obj.snooze_minutes) && obj.snooze_minutes >= 1 && obj.snooze_minutes <= 1440)
  ) {
    failed.add('INV-07');
  }
  if (!textOk(obj.task ?? null, TASK_MAX) || !textOk(obj.clarification_question ?? null, QUESTION_MAX)) {
    failed.add('INV-08');
  }

  const dtMs = typeof obj.datetime === 'string' ? istToMs(obj.datetime) : null;
  if (obj.intent === 'create' && dtMs !== null && dtMs < referenceMs) failed.add('INV-09');
  if (obj.intent === 'reschedule' && dtMs !== null && dtMs < referenceMs) failed.add('INV-10');

  if (obj.intent === 'clarify' && (obj.datetime !== null || obj.snooze_minutes !== null)) {
    failed.add('INV-11');
  }

  const strings = stringValues(obj);
  if (strings.some((s) => (key && s.includes(key)) || KEY_PATTERN.test(s))) failed.add('INV-12');
  if (canary && strings.some((s) => s.includes(canary))) failed.add('INV-13');

  return [...failed].sort();
}
