// Part-1A harness sensor.
//
// Runs the quality gates defined in .specify/memory/constitution.md against the
// Todo Task API described in specs/001-todo-task-api/spec.md:
//   1. Lint          - `npx eslint .` reports 0 errors            (Principle I)
//   2. Security      - no dangerous code, secrets, lint-disables   (Principles II, V)
//   3. Tests         - `node --test`: 0 failed / skipped / todo    (Principles IV, V)
//   4. Traceability  - AC-01 .. AC-63 each named by >= 1 test      (Principle IV, SC-001)
//
// Usage (from anywhere):  node .harness/sensor.js
// Exit code: 0 only when all four checks pass, otherwise 1 (2 if the harness itself breaks).
//
// The harness is read-only towards src/, tests/ and eslint.config.js. It only writes
// into a NEW timestamped folder under evidence/harness-results/ and never overwrites a file.
// Only built-in Node.js modules are used.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_ROOT = path.join(ROOT, 'evidence', 'harness-results');
const SCAN_DIRS = ['src', 'tests'];
const WALK_SKIP_DIRS = new Set(['node_modules', '.git']);
const AC_FIRST = 1;
const AC_LAST = 63;
const MAX_BUFFER = 64 * 1024 * 1024;
const LINT_TIMEOUT_MS = 5 * 60 * 1000;
const TEST_TIMEOUT_MS = 10 * 60 * 1000;
// Plain, colour-free output so the saved logs are readable.
const CHILD_ENV = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };

// ---------------------------------------------------------------------------
// Output handling: everything printed is also kept for run.log
// ---------------------------------------------------------------------------

const transcript = [];

function say(line = '') {
  transcript.push(line);
  console.log(line);
}

function createRunDir() {
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const name = attempt === 0 ? `run-${stamp}` : `run-${stamp}-${attempt}`;
    const dir = path.join(RESULTS_ROOT, name);
    try {
      // Non-recursive: throws EEXIST instead of reusing an older run's folder.
      fs.mkdirSync(dir);
      return dir;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new Error('could not create a unique run folder');
}

function saveFile(runDir, name, content) {
  // 'wx' = fail if the file already exists, so nothing is ever overwritten.
  fs.writeFileSync(path.join(runDir, name), content, { encoding: 'utf8', flag: 'wx' });
}

function runCommand(label, command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: CHILD_ENV,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    ...options,
  });
  return {
    label,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error.message || result.error) : null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    durationMs: Date.now() - started,
  };
}

function formatCommandLog(run) {
  return [
    `$ ${run.label}`,
    `cwd: ${ROOT}`,
    `exit code: ${run.status}`,
    `signal: ${run.signal}`,
    `spawn error: ${run.error}`,
    `duration: ${run.durationMs} ms`,
    '',
    '----- stdout -----',
    run.stdout,
    '----- stderr -----',
    run.stderr,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!WALK_SKIP_DIRS.has(entry.name)) out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function readTextFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.includes('\u0000') ? null : text; // skip binary files
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Check 1 - Lint
// ---------------------------------------------------------------------------

function checkLint() {
  const command = 'npx eslint .';
  // shell: true so `npx` resolves to npx.cmd on Windows as well as npx on POSIX.
  const run = runCommand(command, command, [], { shell: true, timeout: LINT_TIMEOUT_MS });
  const output = `${run.stdout}\n${run.stderr}`;

  const summary = output.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
  const errors = summary ? Number(summary[2]) : 0;
  const warnings = summary ? Number(summary[3]) : 0;

  const reasons = [];
  if (run.error) reasons.push(`could not run eslint: ${run.error}`);
  if (run.status !== 0) reasons.push(`eslint exit code ${run.status} (expected 0)`);
  if (errors !== 0) reasons.push(`${errors} lint error(s) (expected 0)`);

  const details = [`errors: ${errors}`, `warnings: ${warnings}`, `exit code: ${run.status}`];
  if (warnings > 0) details.push('note: warnings do not fail the gate but need a written justification');

  return {
    name: 'Lint',
    pass: reasons.length === 0,
    reasons,
    details,
    log: formatCommandLog(run),
  };
}

// ---------------------------------------------------------------------------
// Check 2 - Security
// ---------------------------------------------------------------------------

// A variable / property / object key whose name mentions a secret, assigned a
// non-empty string literal, e.g.  apiKey = "abc"   token: 'xyz'   "PASSWORD": "pw".
// Comparisons (===) and reads from process.env are not matched.
const SECRET_ASSIGNMENT =
  /([A-Za-z0-9_$-]*(?:key|token|passw(?:or)?d|pwd|secret|credential)[A-Za-z0-9_$-]*)['"]?\s*[:=]\s*(['"`])((?:(?!\2).)+)\2/i;

const SECURITY_RULES = [
  { id: 'eval', what: 'use of eval', re: /\beval\b/ },
  { id: 'new-function', what: 'use of new Function', re: /\bnew\s+Function\b/ },
  { id: 'child-process', what: 'use of child_process', re: /child_process/ },
  { id: 'eslint-disable', what: 'eslint-disable comment', re: /eslint-disable/ },
  {
    id: 'eslint-inline-config',
    what: 'inline ESLint rule reconfiguration',
    re: /\/\*\s*eslint\s+[@\w/-]+\s*:/,
  },
  { id: 'private-key', what: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    id: 'credential-url',
    what: 'URL with embedded username:password',
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:[^\s/@'"`]+@/i,
  },
];

function maskSecret(value) {
  return value.length <= 2 ? '***' : `${value.slice(0, 2)}***`;
}

function findDotEnvFiles() {
  const allowed = new Set(['.env.example', '.env.sample', '.env.template']);
  return walkFiles(ROOT).filter((file) => {
    const base = path.basename(file);
    return /^\.env(\..+)?$/.test(base) && !allowed.has(base);
  });
}

function checkSecurity() {
  const findings = [];
  const scanned = [];
  const missingDirs = [];

  for (const dirName of SCAN_DIRS) {
    const dir = path.join(ROOT, dirName);
    if (!fs.existsSync(dir)) {
      missingDirs.push(dirName);
      continue;
    }
    for (const file of walkFiles(dir)) {
      const text = readTextFile(file);
      if (text === null) continue;
      scanned.push(rel(file));
      text.split(/\r?\n/).forEach((line, index) => {
        const where = `${rel(file)}:${index + 1}`;
        for (const rule of SECURITY_RULES) {
          if (rule.re.test(line)) {
            findings.push(`${where}  [${rule.id}] ${rule.what}: ${line.trim().slice(0, 160)}`);
          }
        }
        const secret = line.match(SECRET_ASSIGNMENT);
        if (secret && !secret[3].includes('${')) {
          findings.push(
            `${where}  [hardcoded-secret] "${secret[1]}" is assigned the literal value "${maskSecret(secret[3])}"`,
          );
        }
      });
    }
  }

  const envFiles = findDotEnvFiles().map(rel);
  for (const envFile of envFiles) {
    findings.push(`${envFile}  [dotenv-file] a .env file exists`);
  }

  const reasons = [];
  for (const dirName of missingDirs) reasons.push(`folder ${dirName}/ not found, nothing to scan`);
  if (findings.length > 0) reasons.push(`${findings.length} security finding(s)`);

  const log = [
    `Scanned folders: ${SCAN_DIRS.map((d) => `${d}/`).join(', ')}`,
    `Files scanned (${scanned.length}):`,
    ...scanned.map((f) => `  ${f}`),
    '',
    `.env files found: ${envFiles.length === 0 ? 'none' : envFiles.join(', ')}`,
    '',
    `Findings (${findings.length}):`,
    ...(findings.length === 0 ? ['  none'] : findings.map((f) => `  ${f}`)),
  ].join('\n');

  return {
    name: 'Security',
    pass: reasons.length === 0,
    reasons,
    details: [`files scanned: ${scanned.length}`, `findings: ${findings.length}`, ...findings.slice(0, 20)],
    log,
  };
}

// ---------------------------------------------------------------------------
// Check 3 - Tests
// ---------------------------------------------------------------------------

const SKIP_PATTERNS = [
  { what: '.skip / .todo / .only modifier', re: /\.(skip|todo|only)\b/ },
  { what: 'skip / todo / only test option', re: /[{,]\s*(skip|todo|only)\s*:/ },
];

function scanForSkippedTests() {
  const findings = [];
  for (const file of walkFiles(path.join(ROOT, 'tests'))) {
    const text = readTextFile(file);
    if (text === null) continue;
    text.split(/\r?\n/).forEach((line, index) => {
      for (const pattern of SKIP_PATTERNS) {
        if (pattern.re.test(line)) {
          findings.push(`${rel(file)}:${index + 1}  ${pattern.what}: ${line.trim().slice(0, 160)}`);
        }
      }
    });
  }
  return findings;
}

function parseTapSummary(tap) {
  const counts = {};
  for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = tap.match(new RegExp(`^# ${key} (\\d+)\\s*$`, 'm'));
    counts[key] = match ? Number(match[1]) : null;
  }
  return counts;
}

function parseTapTestNames(tap) {
  const names = [];
  for (const line of tap.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:not )?ok \d+ - (.*)$/);
    if (!match) continue;
    // Drop a trailing TAP directive such as "# SKIP" / "# TODO", then unescape.
    const name = match[1]
      .replace(/\s+#\s+(SKIP|TODO)\b.*$/i, '')
      .replace(/\\#/g, '#')
      .replace(/\\\\/g, '\\');
    names.push(name);
  }
  return names;
}

function checkTests() {
  const skipFindings = scanForSkippedTests();

  // `node --test` with the TAP reporter so the result can be parsed reliably.
  const run = runCommand('node --test --test-reporter=tap', process.execPath, ['--test', '--test-reporter=tap'], {
    timeout: TEST_TIMEOUT_MS,
  });
  const counts = parseTapSummary(run.stdout);
  const testNames = parseTapTestNames(run.stdout);

  const reasons = [];
  if (run.error) reasons.push(`could not run node --test: ${run.error}`);
  if (run.status !== 0) reasons.push(`node --test exit code ${run.status} (expected 0)`);
  if (counts.tests === null) {
    reasons.push('test summary not found in output');
  } else {
    if (counts.tests === 0 || counts.pass === 0) reasons.push('no tests ran');
    if (counts.fail !== 0) reasons.push(`${counts.fail} failed (expected 0)`);
    if (counts.cancelled) reasons.push(`${counts.cancelled} cancelled (expected 0)`);
    if (counts.skipped !== 0) reasons.push(`${counts.skipped} skipped (expected 0)`);
    if (counts.todo !== 0) reasons.push(`${counts.todo} todo (expected 0)`);
  }
  if (skipFindings.length > 0) reasons.push(`${skipFindings.length} skip/todo/only usage(s) in tests/`);

  const fmt = (v) => (v === null ? 'n/a' : String(v));
  const details = [
    `tests: ${fmt(counts.tests)}, pass: ${fmt(counts.pass)}, fail: ${fmt(counts.fail)}, ` +
      `cancelled: ${fmt(counts.cancelled)}, skipped: ${fmt(counts.skipped)}, todo: ${fmt(counts.todo)}`,
    `skip/todo/only usages in tests/: ${skipFindings.length}`,
    ...skipFindings.slice(0, 20),
  ];

  const log = [
    'Static scan of tests/ for .skip / .todo / .only:',
    ...(skipFindings.length === 0 ? ['  none'] : skipFindings.map((f) => `  ${f}`)),
    '',
    formatCommandLog(run),
  ].join('\n');

  return { name: 'Tests', pass: reasons.length === 0, reasons, details, log, testNames };
}

// ---------------------------------------------------------------------------
// Check 4 - Traceability
// ---------------------------------------------------------------------------

function checkTraceability(testNames) {
  const required = [];
  for (let n = AC_FIRST; n <= AC_LAST; n += 1) required.push(`AC-${String(n).padStart(2, '0')}`);

  const coverage = new Map(required.map((id) => [id, []]));
  const unknownIds = new Set();
  for (const name of testNames) {
    for (const match of name.matchAll(/\bAC-(\d+)\b/g)) {
      const id = `AC-${match[1]}`;
      if (coverage.has(id)) coverage.get(id).push(name);
      else unknownIds.add(id);
    }
  }

  const missing = required.filter((id) => coverage.get(id).length === 0);
  const covered = required.length - missing.length;

  const reasons = [];
  if (testNames.length === 0) reasons.push('no test names available (the test run produced no results)');
  if (missing.length > 0) reasons.push(`${missing.length} acceptance criteria not named by any test`);

  const details = [`covered: ${covered}/${required.length}`];
  if (missing.length > 0) details.push(`missing: ${missing.join(', ')}`);
  if (unknownIds.size > 0) details.push(`IDs not in AC-01..AC-63 (info only): ${[...unknownIds].join(', ')}`);

  const log = [
    `Test names read from the node --test run: ${testNames.length}`,
    `Covered: ${covered}/${required.length}`,
    `Missing: ${missing.length === 0 ? 'none' : missing.join(', ')}`,
    `IDs outside AC-01..AC-63: ${unknownIds.size === 0 ? 'none' : [...unknownIds].join(', ')}`,
    '',
    'Coverage matrix (ID -> tests whose name contains it):',
    ...required.map((id) => {
      const names = coverage.get(id);
      return names.length === 0
        ? `  ${id}  MISSING`
        : `  ${id}  ${names.length} test(s)\n${names.map((n) => `        - ${n}`).join('\n')}`;
    }),
  ].join('\n');

  return { name: 'Traceability', pass: reasons.length === 0, reasons, details, log };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function report(index, total, result) {
  say(`[${index}/${total}] ${result.name.padEnd(13, '.')} ${result.pass ? 'PASS' : 'FAIL'}`);
  for (const reason of result.reasons) say(`      reason: ${reason}`);
  for (const detail of result.details) say(`      ${detail}`);
  say();
}

function main() {
  let runDir;
  try {
    runDir = createRunDir();
  } catch (err) {
    console.error(`Harness error: cannot create evidence folder: ${err.message}`);
    return 2;
  }

  const startedAt = new Date();
  say('Part-1A harness sensor');
  say(`project:  ${ROOT}`);
  say(`started:  ${startedAt.toISOString()}`);
  say(`node:     ${process.version}`);
  say(`evidence: ${rel(runDir)}`);
  say();

  const steps = [
    { file: '01-lint.log', run: () => checkLint() },
    { file: '02-security.log', run: () => checkSecurity() },
    { file: '03-tests.log', run: () => checkTests() },
    { file: '04-traceability.log', run: (prev) => checkTraceability(prev.testNames || []) },
  ];

  const results = [];
  let previous = {};
  steps.forEach((step, i) => {
    let result;
    try {
      result = step.run(previous);
    } catch (err) {
      result = {
        name: ['Lint', 'Security', 'Tests', 'Traceability'][i],
        pass: false,
        reasons: [`harness error: ${err.message}`],
        details: [],
        log: String(err.stack || err),
      };
    }
    saveFile(runDir, step.file, `${result.log}\n`);
    report(i + 1, steps.length, result);
    results.push(result);
    previous = result;
  });

  const allPass = results.every((r) => r.pass);
  const exitCode = allPass ? 0 : 1;
  const finishedAt = new Date();

  say(`RESULT: ${allPass ? 'PASS' : 'FAIL'} (${results.filter((r) => r.pass).length}/${results.length} checks passed)`);
  say(`exit code: ${exitCode}`);
  say(`duration: ${finishedAt - startedAt} ms`);

  saveFile(
    runDir,
    'summary.json',
    `${JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        node: process.version,
        result: allPass ? 'PASS' : 'FAIL',
        exitCode,
        checks: results.map((r) => ({ name: r.name, result: r.pass ? 'PASS' : 'FAIL', reasons: r.reasons, details: r.details })),
      },
      null,
      2,
    )}\n`,
  );
  saveFile(runDir, 'run.log', `${transcript.join('\n')}\n`);
  return exitCode;
}

process.exitCode = main();
