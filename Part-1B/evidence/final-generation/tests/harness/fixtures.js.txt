// Shared harness-test fixtures: the real dataset/spec and a fake runCase (no spawn, no network).
import fs from 'node:fs';

export const DATASET = JSON.parse(fs.readFileSync(new URL('../../evals/dataset.json', import.meta.url), 'utf8'));
export const SPEC_TEXT = fs.readFileSync(new URL('../../specs/001-nl-reminder-agent/spec.md', import.meta.url), 'utf8');
export const CANARY = 'RMDR-CANARY-7Q4X-K2M9';

const QUESTIONS = {
  needs_clarification: 'When should I remind you?',
  refused: "I can't help with that request.",
  error: 'Something went wrong while processing your reminder. Please try again.',
};

function taskFrom(keywords) {
  if (keywords === null) return null;
  return keywords.map((k) => (Array.isArray(k) ? k[0] : k)).join(' ');
}

// An output that satisfies the case's expected values (semantic score 1.0).
export function idealOutput(c) {
  const e = c.expected;
  return {
    schema_version: '1.0',
    intent: e.intent,
    status: e.status,
    task: taskFrom(e.task_keywords),
    datetime: e.datetime,
    snooze_minutes: e.snooze_minutes,
    clarification_question: e.intent === 'clarify' ? QUESTIONS[e.status] : null,
    reason: e.reason === null ? null : e.reason[0],
  };
}

export function diagLine(fields = {}) {
  return 'AGENT_DIAG ' + JSON.stringify({ attempts: 1, failure_kind: null, http_status: 200, model: 'gemini-3.8-flash', ...fields }) + '\n';
}

export function serviceFailure(kind = '429') {
  const out = {
    schema_version: '1.0',
    intent: 'clarify',
    status: 'error',
    task: null,
    datetime: null,
    snooze_minutes: null,
    clarification_question: QUESTIONS.error,
    reason: 'model_service_failure',
  };
  return { stdout: JSON.stringify(out) + '\n', stderr: diagLine({ attempts: 3, failure_kind: kind, http_status: 429 }), exitCode: 3, timedOut: false };
}

// overrides: { [caseId]: (case) => runResult }
export function createFakeRunCase(overrides = {}) {
  const calls = [];
  const runCase = async (c) => {
    calls.push({ id: c.id, input: c.input });
    if (overrides[c.id]) return overrides[c.id](c);
    return { stdout: JSON.stringify(idealOutput(c)) + '\n', stderr: diagLine(), exitCode: 0, timedOut: false };
  };
  runCase.calls = calls;
  return runCase;
}

export function createRecordingSleep() {
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
  };
  sleep.waits = waits;
  return sleep;
}

export function fakeNow() {
  let t = Date.parse('2026-11-12T04:45:03.120Z');
  return () => {
    t += 1000;
    return t;
  };
}
