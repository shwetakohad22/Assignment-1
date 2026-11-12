// Report rendering and write-once output (FR-40, AC-22, R-12). Everything is secret-scanned before writing.
import fs from 'node:fs';
import path from 'node:path';
import { containsSecret, redact } from './runner.js';

const GATE_ORDER = Object.freeze(['lint', 'secrets', 'schema', 'invariant', 'evaluation', 'traceability', 'failure_reporting']);
const NOTE_PREFIX = "CHK-SECRET: report, summary and per-case stderr/stdout scanned for key value and AIza pattern: ";

function cell(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✔' : '✘';
  return String(v).replace(/\|/g, '\\|');
}

export function renderSummary(report) {
  const t = report.totals ?? {};
  const lines = [
    `# Evaluation summary — ${report.run_id}`,
    '',
    `**Verdict**: ${report.verdict} (exit code ${report.exit_code})`,
    '',
    `Reason: ${report.verdict_reason}`,
    '',
    `Spec ${report.spec_version} · dataset ${report.dataset_version} · reference time ${report.reference_time} (${report.timezone}) · model ${report.model ?? '—'}`,
    '',
    `Totals: PASS ${t.PASS ?? 0} · FAIL ${t.FAIL ?? 0} · SERVICE_FAILURE ${t.SERVICE_FAILURE ?? 0} · CONFIG_ERROR ${t.CONFIG_ERROR ?? 0}`,
    '',
    `Overall score: ${report.overall_score} (best case ${report.best_case_score}) · guardrail cases: ${report.guardrail_result?.passed ?? 0}/${report.guardrail_result?.total ?? 0} PASS`,
    '',
    `Service failures: ${
      report.service_failure_ids.length === 0 ? 'none' : report.service_failure_ids.map((s) => `${s.id} (${s.failure_kind ?? 'unknown'})`).join(', ')
    }`,
    '',
  ];
  if (report.dataset_errors.length > 0) {
    lines.push('## Dataset errors', '', ...report.dataset_errors.map((e) => `- ${e}`), '');
  }
  lines.push('## Quality gates', '', '| Gate | Result | Rule |', '|------|--------|------|');
  for (const name of GATE_ORDER) {
    const g = report.quality_gates[name];
    lines.push(`| ${name} | ${g.result} | ${cell(g.rule)} |`);
  }
  lines.push(
    '',
    '## Cases',
    '',
    '| ID | Category | Guardrail | Classification | L1 | L2 | Task | Time | Semantic | Attempts | Kind | Failed checks |',
    '|----|----------|-----------|----------------|----|----|------|------|----------|----------|------|---------------|',
  );
  for (const c of report.cases) {
    const failed = [...c.layer1.failed, ...c.layer2.failed].join(', ');
    lines.push(
      `| ${c.id} | ${c.category} | ${cell(c.guardrail)} | ${c.classification} | ${cell(c.layer1.pass)} | ${cell(c.layer2.pass)} | ` +
        `${c.task_score} | ${c.time_score} | ${c.semantic_score} | ${cell(c.attempts)} | ${cell(c.failure_kind)} | ${failed === '' ? '—' : failed} |`,
    );
  }
  lines.push('', '## Notes', '', ...report.notes.map((n) => `- ${n}`), '');
  return lines.join('\n');
}

function serialise(report) {
  return { json: JSON.stringify(report, null, 2) + '\n', summary: renderSummary(report) };
}

export function writeReport(report, { evidenceDir, keyForScan = '' }) {
  let final = structuredClone(report);
  let { json, summary } = serialise(final);

  // CHK-SECRET on everything serialised (AC-22, FR-34).
  const reportHit = containsSecret(json, keyForScan) || containsSecret(summary, keyForScan);
  if (reportHit) {
    final = redact(final, keyForScan);
    final.verdict = 'ERROR';
    final.verdict_reason = 'CHK-SECRET hit in the report (FR-34); values redacted; no score is claimed';
    final.exit_code = 2;
    final.quality_gates.secrets = { ...final.quality_gates.secrets, result: 'FAIL' };
    final.notes.push('secret_detected: report');
  }
  const anyHit = reportHit || final.stderr_secret_hits.length > 0 || final.stdout_secret_hits.length > 0;
  final.notes.push(NOTE_PREFIX + (anyHit ? 'secret_detected' : 'clean'));
  ({ json, summary } = serialise(final));
  if (containsSecret(json, keyForScan) || containsSecret(summary, keyForScan)) {
    throw new Error('CHK-SECRET: report still contains secret material after redaction; nothing written');
  }

  // Write-once run folder (R-12): non-recursive final mkdir, files with flag 'wx'.
  const runsDir = path.join(evidenceDir, 'eval-runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const runDir = path.join(runsDir, final.run_id);
  fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir, 'eval-results.json'), json, { flag: 'wx' });
  fs.writeFileSync(path.join(runDir, 'summary.md'), summary, { flag: 'wx' });
  fs.writeFileSync(path.join(evidenceDir, 'eval-results.json'), json);
  return { report: final, runDir };
}
