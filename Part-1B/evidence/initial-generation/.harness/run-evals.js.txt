// Evaluation entry point (npm run eval). The ONLY file that starts a child process (exception E-1).
// The key reaches this process through `node --env-file=.env`; this file never opens .env (R-03).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runEvaluation, buildCrashReport } from './lib/runner.js';
import { writeReport } from './lib/report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ENTRY = path.join(ROOT, 'src', 'cli.js');
const HARD_KILL_MS = 150_000;

function runCaseWith(dataset) {
  return (c) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [AGENT_ENTRY, '--reference-time', dataset.reference_time, '--timezone', dataset.timezone], {
        shell: false,
        env: process.env,
        stdio: 'pipe',
      });
      const out = [];
      const err = [];
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, HARD_KILL_MS);
      child.stdout.on('data', (d) => out.push(d));
      child.stderr.on('data', (d) => err.push(d));
      child.on('error', () => {});
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
          exitCode: timedOut ? null : code,
          timedOut,
        });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(c.input, 'utf8');
    });
}

async function main() {
  const keyForScan = process.env.GEMINI_API_KEY ?? '';
  const evidenceDir = path.join(ROOT, 'evidence');
  const now = () => Date.now();
  const runId = 'run-' + new Date().toISOString().replace(/[:.]/g, '-');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let dataset = null;
  let report;
  try {
    dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'dataset.json'), 'utf8'));
    const specText = fs.readFileSync(path.join(ROOT, 'specs', '001-nl-reminder-agent', 'spec.md'), 'utf8');
    const canary = fs.readFileSync(path.join(ROOT, 'prompts', 'system-prompt.md'), 'utf8').split(/\r?\n/, 1)[0].trim();
    const runCase = runCaseWith(dataset);
    report = await runEvaluation({ dataset, specText, canary, runCase, sleep, now, keyForScan, runId });
  } catch {
    report = buildCrashReport({ dataset, now, runId });
  }
  const { report: final, runDir } = writeReport(report, { evidenceDir, keyForScan });
  for (const c of final.cases) console.log(`${c.id} ${c.classification}`);
  if (final.dataset_errors.length > 0) console.log(`dataset errors: ${final.dataset_errors.length}`);
  console.log(`VERDICT ${final.verdict} (score ${final.overall_score}) → ${path.relative(ROOT, runDir)}`);
  process.exitCode = final.exit_code;
}

main().catch(() => {
  process.exitCode = 2;
});
