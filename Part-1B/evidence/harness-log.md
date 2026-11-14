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

## Note
The section "Exception E-1" above was written by the coding agent (Claude Code) from the approved plan. I reviewed and approved it. All sections below are my own words.

## 1. Initial generation
Q: What did Claude have before it wrote the code, and which command did I use?
A:Before writing any code, Claude already had the full set of Spec Kit documents. These were committed first as ada5041 ("Spec Kit artifacts… before implementation"):
the constitution (.specify/memory/constitution.md)
the spec, version 1.4 (specs/…/spec.md), which sets out the requirement IDs, JSON output schema, pass threshold, scoring method and revision history
the plan (plan.md, plus research.md, data-model.md, contracts/ and quickstart.md)
the task list (tasks.md, tasks T001–T080)

Q: What rule did I give Claude about failures and about my API key?
A:Both rules are in the constitution.
Failures (Principle VI, Honest Failure Classification; Principle VII, Evaluation Integrity): Model-service failures (network errors, HTTP 429/rate limits, quota, timeouts, 5xx) must be reported separately from application failures and test failures. They must never count as passes or as application failures, never be hidden or quietly retried away, and every report must give their count and case IDs. A failing result must be reported as failing, with evidence. It gets fixed by changing the application, not the measurement. That means no deleting or weakening test cases, no lowering the threshold, and no turning off lint, guardrail or security checks.
API key (Principle II, Secret Hygiene, NON-NEGOTIABLE): The Gemini key is read only from the GEMINI_API_KEY environment variable at runtime. It must never be hardcoded, logged, printed, put in error messages, copied into evidence, or committed. Claude must never open or read .env, and may only check that it is ignored (git check-ignore .env). .env must stay in .gitignore. If the key is missing, the program fails with a clear message that names the variable but never shows a value.

Q: Where is the first version saved?
A:In evidence/initial-generation/. It holds a copy of the code as first generated: src/, tests/, .harness/, evals/dataset.json, prompts/system-prompt.md, package.json and eslint.config.js. The .js files are saved as .txt so the lint and security checks don't scan them as live code. It was committed in e83cc56. The final version is kept separately in evidence/final-generation/.


## 2. Failure 1: a test defect
Q: Which task stopped, and what was the error?
A: It stopped at T024, the Phase 2 checkpoint ("Run npm test → all Phase 2 tests pass … Fix code, never the tests"). Of 62 tests, 61 passed and 1 failed. The failing test was FR-10: non-conforming replies become invalid_model_output and never echo the raw text in tests/normalize.test.js, which T013 had written. The error was AssertionError [ERR_ASSERTION]: null at line 44, with actual: false, expected: true. The saved output is in evidence/failure-1-before-repair/npm-test-output.txt.

Q: Why was it a problem in the test and not in the agent?
A: The agent handled all 12 bad replies correctly. For each one, the line just before, assert.deepEqual(out, errorOutput('invalid_model_output')), passed. That means the output was exactly the correct error shape and copied nothing from the model.
The failing line was the leak check: assert.ok(!JSON.stringify(out).includes(text)). One of the bad replies is the literal text 'null'. The correct error output always has fields like "task": null and "datetime": null, so its JSON text always contains the word null. The check found that word and called it a leak, but nothing had leaked. It was the normal JSON spelling of null fields. No agent output could pass that line, even a perfect one, so the bug was in the test's checking method, not in the agent.

Q: What fix did I choose, and why did it not weaken the test?
A: The fix was to compare the raw reply against the string values in the output, not against the whole JSON text. For every string field, the test now checks value !== text && !value.includes(text). Fixed words from the contract (SCHEMA_VERSION, INTENTS, STATUSES, ALL_REASONS) are allowed, because those always come from the contract and can't be a leak. The before and after versions are evidence/failure-1-before-repair/normalize.test.js.before and tests/normalize.test.js.
It did not weaken the test because:
All 12 bad replies are still there. None were deleted or skipped.
The exact deepEqual against errorOutput('invalid_model_output') is unchanged and still requires the exact error shape.
The leak check still covers every text field the agent returns. Real leaks, like the prose reply or the fenced JSON, are still caught. The only difference is that the JSON keyword null and fixed contract words no longer count as leaks.
The agent code was not changed. No threshold, scoring rule, lint rule or guardrail was touched, and the failing run was saved as evidence before the repair.


## 3. Model, threshold and scoring
Q: Which models were used, and where is the setting made (no secrets)?
A: The agent uses Google's Gemini models. The model name is not fixed in the code. The program reads it from the environment variable GEMINI_MODEL when it starts. If that variable is missing or empty, it falls back to a default, gemini-3.8-flash, which is set in src/config.js. This follows spec requirement FR-04. You can switch to a different model by setting the environment variable, without changing any code. The API key is handled separately and in the same way: it is read only from the GEMINI_API_KEY environment variable, sent in a request header rather than the URL, and never written in code, logs or evidence. Its value was never read or shown.
Three models were used across the three live evaluation runs. The first run used the default, gemini-3.8-flash. It ended inconclusive because the free tier's rate limits caused many service failures. The second run used gemini-2.5-flash-lite. That ended in an error because the model returned HTTP 404 (not available for this key). The third and final run used gemini-2.5-flash, set through GEMINI_MODEL, and it passed. Spec revision 1.6 records that the evaluation used gemini-2.5-flash while the code default stays gemini-3.8-flash. So the model was changed through configuration, not by editing the program.

Q: What threshold and scoring method were declared before the final evaluation?
A: The threshold and scoring method were written in the spec on 2026-11-12, before any evaluation run. They were also copied into the harness file .harness/threshold.js and into the dataset, so they couldn't be changed quietly later.
Each case is checked in three layers. First, the output must match the JSON schema contract. Second, it must satisfy the invariants and behaviour rules, such as a valid IST datetime, no past times, and no leaked key. Third, it gets a semantic score made of two parts worth 0.5 each. The task part checks that the expected keywords appear in the task. The time part checks that the datetime is the correct instant with a +05:30 offset, or that the snooze minutes match. A case passes only if it clears the first two layers and scores at least 0.8. Since each part is worth 0 or 0.5, that means both parts must be correct.
The overall score is the number of passing cases divided by all 25 cases. The run passes only if that score is at least 0.80 and every guardrail case passes. Cases that fail because of the model service (429, timeouts, 5xx) are reported separately. They are never counted as passes and they stay in the total. The spec says these numbers and formulas can't be lowered or changed after a run. The later revisions changed only the pause between cases and the model used. The final run scored 24 out of 25, which is 0.96, and all 5 guardrail cases passed.


## 4. Evaluation runs
Q: Run 1: what happened and why?
A: The result was INCONCLUSIVE. Eight cases passed, but 17 failed on the Gemini service side (429 rate limits, timeouts and 5xx errors). The free tier allows only 5 requests a minute, and the 1-second pause between cases was too short. The agent code itself was fine.

Q: Run 2: what happened and why?
A: The result was ERROR. I tried the model gemini-2.5-flash-lite, and it returned 404 because it isn't available for my API key. That counts as a setup error, so no score was given.

Q: What did I change after each run, and what did I NOT change?
A: After Run 1, I raised the pause between cases to 7 seconds (spec 1.5). After Run 2, I raised it to 13 seconds and switched the model to gemini-2.5-flash using GEMINI_MODEL (spec 1.6). I recorded each change in the spec before the next run. I did not change the threshold, the scoring, the retries, the guardrails, the 25 test cases or the agent code.

Q: Run 3: what was the result?
A: PASS. 24 of 25 cases passed, a score of 0.96, which is above the 0.80 needed. All 5 guardrail cases passed, along with all the quality gates.

Q: What was the one service failure (EV-17), and how was it counted?
A: EV-17 is the input "change it". Gemini returned 429 (too many requests) on all three tries. It was marked as a service failure. It did not count as a pass or as a bug in the agent, but it stayed in the total, which is why the score is 24/25.


## 5. Final human decision
Q: ACCEPT or REJECT, and why?
A: ACCEPT. The final run passed with 24 of 25 cases (0.96, above the 0.80 needed), and all 5 guardrail cases passed. All 217 unit tests pass, lint shows 0 errors, and the secrets check is clean. The one miss, EV-17, was a Gemini rate limit (429), not a bug in the agent. The threshold, scoring, test cases and guardrails were never changed to get the pass. The only changes were the pause time and the model setting, and both were recorded in the spec before each run.

Q: What are the known limitations and residual risks?
A:Free tier limits: Gemini's free tier allows 5 requests a minute and 20 a day, so rate-limit failures like EV-17 can still happen.
Model can vary: the model's answers can change between runs or model versions. The passing result applies only to gemini-2.5-flash. The code default, gemini-3.8-flash, never had a clean run.
Gaps in the live test: some date phrases are not in the 25 cases, so the live run didn't check how the model handles them. Examples are "at 5" with no am/pm, "5pm EST", "noon", "midnight", "day after tomorrow" and a date with no year. These are covered only by unit tests that use a fake model.
Only one timezone: the agent supports Asia/Kolkata (IST) only.
Simple scoring: the semantic check uses keyword matching. A correct answer worded differently (like "phone mother") would be marked as a fail.
One run only: the pass comes from a single run of 25 cases, which is a small sample.
E-1 exception: the evaluation runner is allowed to start child processes under exception E-1. It is narrow and documented, but it is still an exception to the security rule.

