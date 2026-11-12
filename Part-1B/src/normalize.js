// Model reply → contract object (FR-09, FR-10, FR-13, FR-18, GR-06). Raw text is never copied out.
import {
  SCHEMA_VERSION,
  MODEL_FIELDS,
  INTENTS,
  CLARIFY_REASONS,
  REFUSAL_REASONS,
  errorOutput,
  refusalOutput,
  clarifyOutput,
  validateOutput,
  PAST_TIME_QUESTION,
  OUT_OF_RANGE_QUESTION,
} from './contract.js';
import { isValidIstDatetime, istToMs } from './time.js';

const MODEL_STATUSES = Object.freeze(['ok', 'needs_clarification', 'refused']);

function invalid() {
  return errorOutput('invalid_model_output');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function cleanText(v) {
  if (v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export function normalize(text, { referenceMs }) {
  // (1) parse
  if (typeof text !== 'string' || text.trim() === '') return invalid();
  let reply;
  try {
    reply = JSON.parse(text);
  } catch {
    return invalid();
  }

  // (2) exact 7-field model reply
  if (!isPlainObject(reply)) return invalid();
  const keys = Object.keys(reply);
  if (keys.length !== MODEL_FIELDS.length || !MODEL_FIELDS.every((f) => keys.includes(f))) return invalid();

  // (3) types and enums
  const { intent, status, reason, task, datetime, snooze_minutes: snooze, clarification_question: question } = reply;
  if (!INTENTS.includes(intent)) return invalid();
  if (!MODEL_STATUSES.includes(status)) return invalid();
  if (!(reason === null || CLARIFY_REASONS.includes(reason) || REFUSAL_REASONS.includes(reason))) return invalid();
  for (const v of [task, datetime, question]) {
    if (!(v === null || typeof v === 'string')) return invalid();
  }
  if (!(snooze === null || (typeof snooze === 'number' && Number.isFinite(snooze)))) return invalid();

  const candidate = {
    schema_version: SCHEMA_VERSION,
    intent,
    status,
    task: cleanText(task),
    datetime: cleanText(datetime),
    snooze_minutes: snooze,
    clarification_question: cleanText(question),
    reason,
  };
  if (candidate.datetime !== null && !isValidIstDatetime(candidate.datetime)) return invalid();

  // (4) model refusal → fixed GR-06 shape (model task and question discarded)
  if (status === 'refused' && REFUSAL_REASONS.includes(reason)) {
    return refusalOutput(reason);
  }

  // (5) conversions (deterministic, independent of the model)
  const converted = applyConversions(candidate, referenceMs);

  // (6) contract check (INV-12/13 belong to the guardrail post-check)
  const failed = validateOutput(converted, referenceMs, {}).filter((id) => id !== 'INV-12' && id !== 'INV-13');
  if (failed.length > 0) return invalid();
  return converted;
}

function applyConversions(candidate, referenceMs) {
  const { intent, status, datetime, task, snooze_minutes: snooze } = candidate;
  if (status !== 'ok') return candidate;

  // FR-18 / INV-09 / INV-10: a create or reschedule time before the reference time → clarify / past_time.
  if ((intent === 'create' || intent === 'reschedule') && datetime !== null) {
    const ms = istToMs(datetime);
    if (ms !== null && ms < referenceMs) return clarifyOutput('past_time', task, PAST_TIME_QUESTION);
  }

  // FR-13: snooze minutes rounded up to a whole minute, then range 1–1440 → else clarify / out_of_range.
  if (intent === 'snooze' && typeof snooze === 'number') {
    const minutes = Math.ceil(snooze);
    if (minutes < 1 || minutes > 1440) return clarifyOutput('out_of_range', null, OUT_OF_RANGE_QUESTION);
    return { ...candidate, snooze_minutes: minutes };
  }
  return candidate;
}
