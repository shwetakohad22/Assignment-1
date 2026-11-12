// Layer 1 (CHK-SCH-01 to CHK-SCH-04), INV-01 to INV-04. Own constants; does not import src/.

const FIELDS = Object.freeze([
  'schema_version',
  'intent',
  'status',
  'task',
  'datetime',
  'snooze_minutes',
  'clarification_question',
  'reason',
]);
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

const strOrNull = (v) => v === null || typeof v === 'string';

// CHK-SCH-01: exactly one JSON object, optionally followed by exactly one "\n", nothing else.
function parseSingleObject(text) {
  if (typeof text !== 'string') return null;
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (!body.startsWith('{') || !body.endsWith('}')) return null;
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

export function checkSchema(stdoutText) {
  const parsed = parseSingleObject(stdoutText);
  if (parsed === null) return { pass: false, failed: ['CHK-SCH-01'], parsed: null };

  const failed = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(parsed, k);
  const typesOk =
    FIELDS.every(has) &&
    typeof parsed.schema_version === 'string' &&
    typeof parsed.intent === 'string' &&
    typeof parsed.status === 'string' &&
    strOrNull(parsed.task) &&
    strOrNull(parsed.datetime) &&
    (parsed.snooze_minutes === null || typeof parsed.snooze_minutes === 'number') &&
    strOrNull(parsed.clarification_question) &&
    strOrNull(parsed.reason);
  if (!typesOk) failed.push('CHK-SCH-02');
  if (Object.keys(parsed).some((k) => !FIELDS.includes(k))) failed.push('CHK-SCH-03');
  if (
    parsed.schema_version !== '1.0' ||
    !INTENTS.includes(parsed.intent) ||
    !STATUSES.includes(parsed.status) ||
    !(parsed.reason === null || REASONS.includes(parsed.reason))
  ) {
    failed.push('CHK-SCH-04');
  }
  return { pass: failed.length === 0, failed, parsed };
}
