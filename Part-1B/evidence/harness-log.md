# Harness Log — Part-1B

## Exception E-1: `child_process` in the evaluation runner

The constitution does not ban `child_process`. But the project's quality harness (as in Part-1A)
has a security rule that flags **any** use of `child_process`. FR-24 requires each case to run as
a separate child process, so the runner needs **one narrow, documented exception**. It is recorded
up front here (before any harness run) and repeated in `evidence/harness-log.md`.

- **ID**: E-1 · **Date**: 2026-11-12 · **Requirement**: FR-24 (spec clarification 2026-11-12).
- **Scope**: exactly one file, `.harness/run-evals.js`. Exactly one import line,
  `import { spawn } from 'node:child_process';`. Exactly one call,
  `spawn(process.execPath, [AGENT_ENTRY, '--reference-time', …, '--timezone', …], { shell: false, … })`.
  `AGENT_ENTRY` is a constant `path.join(ROOT, 'src', 'cli.js')`. The command is Node itself, no
  shell, and no user- or dataset-controlled executable or argument except the dataset's fixed
  reference-time/timezone values (which are validated by CHK-DATA first). The case text goes only
  to **stdin**, never to argv.
- **Not covered**: `exec`, `execSync`, `spawnSync`, `shell: true`, any other file (including
  `tests/` and `src/`). Any change to the import or the call shape makes E-1 stop applying, and the
  security check reports a normal FAIL. When it applies, the harness prints "ALLOWED by documented
  exception E-1", never a silent pass.
- **Why tests don't need it**: `src/cli.js` exports `main({ argv, stdin, stdout, stderr, env,
  modelClient })` returning the exit code, and the runner logic in `.harness/lib/runner.js` takes
  an injected `runCase`. All tests run in-process. The agent itself never spawns anything.
- **Principles II/VII**: unaffected. The exception allows starting the project's own agent. It
  does not relax lint, tests, guardrails or secret checks.
