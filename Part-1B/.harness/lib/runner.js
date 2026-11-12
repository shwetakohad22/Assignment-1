// Evaluation runner (FR-23 to FR-34, FR-39, FR-40). Pure: runCase, sleep and now are injected.
// No filter, skip, retry, resume or merge option exists (Principle VII).
import { THRESHOLD, toDatasetForm } from '../threshold.js';
import { validateDataset } from './dataset.js';
import { parseDiag } from './diag.js';
import { classifyRun } from './classify.js';
import { computeVerdict } from './verdict.js';
import { computeGates } from './gates.js';
import { CHECKS_MAP } from './checks.js';
import { checkSchema } from '../evaluators/schema.js';
import { checkProperties } from '../evaluators/properties.js';
import { taskScore, timeScore } from '../evaluators/quality.js';

export const KEY_PATTERN = /AIza[0-9A-Za-z_-]{35}/;
export const LIMITATION_NOTE = 'CHK-SECRET checks the key value and the AIza pattern; .env contents are not read (Principle II)';
const GAP_MS = 1000;

export function containsSecret(text, keyForScan) {
  const s = String(text ?? '');
  return (typeof keyForScan === 'string' && keyForScan !== '' && s.includes(keyForScan)) || KEY_PATTERN.test(s);
}

// Deep copy with every string value scrubbed of the key value and AIza-shaped strings.
export function redact(value, keyForScan) {
  if (typeof value === 'string') {
    let s = value.replace(new RegExp(KEY_PATTERN.source, 'g'), '[REDACTED]');
    if (typeof keyForScan === 'string' && keyForScan !== '') s = s.split(keyForScan).join('[REDACTED]');
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, keyForScan));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, keyForScan)]));
  }
  return value;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

export function makeRunId(ms) {
  return 'run-' + iso(ms).replace(/[:.]/g, '-');
}

function pick(dataset, field) {
  return dataset !== null && typeof dataset === 'object' && Object.prototype.hasOwnProperty.call(dataset, field) ? dataset[field] : null;
}

function baseReport({ dataset, runId, startedAt }) {
  return {
    run_id: runId,
    spec_version: pick(dataset, 'spec_version'),
    dataset_version: pick(dataset, 'dataset_version'),
    reference_time: pick(dataset, 'reference_time'),
    timezone: pick(dataset, 'timezone'),
    model: null,
    started_at: startedAt,
    finished_at: null,
    threshold: toDatasetForm(),
  };
}

function assemble({ base, caseResults, datasetErrors, crashed, stderrHits, stdoutHits, notes, model, finishedAt }) {
  const v = computeVerdict({ caseResults, datasetErrors, crashed });
  let { verdict, verdict_reason: verdictReason, exit_code: exitCode } = v;
  if (stderrHits.length > 0 || stdoutHits.length > 0) {
    verdict = 'ERROR';
    verdictReason = 'CHK-SECRET hit in a case stderr or stdout (FR-24, FR-34); no score is claimed';
    exitCode = 2;
  }
  const serviceFailureIds = caseResults
    .filter((r) => r.classification === 'SERVICE_FAILURE')
    .map((r) => ({ id: r.id, failure_kind: r.failure_kind }));
  const qualityGates = computeGates({
    caseResults,
    verdict,
    datasetErrors,
    serviceFailureIds,
    stderrSecretHits: stderrHits,
    stdoutSecretHits: stdoutHits,
    reportSecretHit: false,
    checksMap: CHECKS_MAP,
  });
  return {
    ...base,
    model,
    finished_at: finishedAt,
    cases: caseResults,
    totals: v.totals,
    service_failure_ids: serviceFailureIds,
    overall_score: v.overall_score,
    best_case_score: v.best_case_score,
    guardrail_result: v.guardrail_result,
    verdict,
    verdict_reason: verdictReason,
    exit_code: exitCode,
    dataset_errors: datasetErrors,
    checks_map: CHECKS_MAP,
    stderr_secret_hits: stderrHits,
    stdout_secret_hits: stdoutHits,
    quality_gates: qualityGates,
    notes: [LIMITATION_NOTE, ...notes],
  };
}

// Report for a run that crashed before or during the cases (FR-34: ERROR, no score claimed).
export function buildCrashReport({ dataset, now, runId }) {
  const ms = now();
  const base = baseReport({ dataset, runId: runId ?? makeRunId(ms), startedAt: iso(ms) });
  return assemble({
    base,
    caseResults: [],
    datasetErrors: [],
    crashed: true,
    stderrHits: [],
    stdoutHits: [],
    notes: ['evaluation crashed'],
    model: null,
    finishedAt: iso(now()),
  });
}

function evaluateCase(c, run, { referenceMs, canary, keyForScan }) {
  const stdout = typeof run.stdout === 'string' ? run.stdout : '';
  const diag = parseDiag(run.stderr);
  const layer1 = checkSchema(stdout);
  const parsed = layer1.parsed;
  const exitCode = Number.isInteger(run.exitCode) ? run.exitCode : null;
  const kind = classifyRun({ exitCode, parsed, diag });

  let layer2 = { pass: null, failed: [] };
  if (kind === 'EVALUATED') {
    layer2 = parsed === null ? { pass: false, failed: [] } : checkProperties(parsed, { expected: c.expected, referenceMs, key: keyForScan, canary });
  }
  const tScore = parsed === null ? 0 : taskScore(parsed.task ?? null, c.expected.task_keywords);
  const mScore = parsed === null ? 0 : timeScore(parsed, c.expected);
  const semantic = tScore + mScore;

  let classification = kind;
  if (kind === 'EVALUATED') {
    classification = layer1.pass && layer2.pass === true && semantic >= THRESHOLD.caseSemantic ? 'PASS' : 'FAIL';
  }
  return {
    result: {
      id: c.id,
      category: c.category,
      guardrail: c.guardrail,
      classification,
      exit_code: exitCode,
      timed_out: run.timedOut === true,
      layer1: { pass: layer1.pass, failed: layer1.failed },
      layer2: { pass: layer2.pass, failed: layer2.failed },
      task_score: tScore,
      time_score: mScore,
      semantic_score: semantic,
      attempts: diag ? diag.attempts : null,
      failure_kind: classification === 'SERVICE_FAILURE' && diag ? diag.failure_kind : null,
      output: parsed === null ? null : redact(parsed, keyForScan),
    },
    model: diag && typeof diag.model === 'string' ? diag.model : null,
  };
}

export async function runEvaluation({ dataset, specText, canary, runCase, sleep, now, keyForScan = '', runId }) {
  const startMs = now();
  const base = baseReport({ dataset, runId: runId ?? makeRunId(startMs), startedAt: iso(startMs) });
  const empty = { caseResults: [], crashed: false, stderrHits: [], stdoutHits: [], notes: [], model: null };

  // 1. CHK-DATA before any case (FR-23, AC-19)
  const datasetErrors = validateDataset(dataset, specText);
  if (datasetErrors.length > 0) {
    return assemble({ base, ...empty, datasetErrors, finishedAt: iso(now()) });
  }

  // 2. every case, in dataset order, exactly once, 1000 ms apart (FR-24, FR-39)
  const referenceMs = Date.parse(dataset.reference_time);
  const caseResults = [];
  const stderrHits = [];
  const stdoutHits = [];
  const notes = [];
  let model = null;
  for (let i = 0; i < dataset.cases.length; i += 1) {
    const c = dataset.cases[i];
    if (i > 0) await sleep(GAP_MS);
    const run = await runCase(c);
    // CHK-SECRET on raw stderr and raw stdout before they are discarded; only the case ID is recorded.
    if (containsSecret(run.stderr, keyForScan)) {
      stderrHits.push(c.id);
      notes.push(`secret_detected: stderr ${c.id}`);
    }
    if (containsSecret(run.stdout, keyForScan)) {
      stdoutHits.push(c.id);
      notes.push(`secret_detected: stdout ${c.id}`);
    }
    const { result, model: caseModel } = evaluateCase(c, run, { referenceMs, canary, keyForScan });
    if (model === null && caseModel !== null) model = caseModel;
    caseResults.push(result);
  }

  return assemble({ base, caseResults, datasetErrors: [], crashed: false, stderrHits, stdoutHits, notes, model, finishedAt: iso(now()) });
}
