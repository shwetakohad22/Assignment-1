# SEZG534 – Assignment 1

This repository has two parts. Both were built with Spec Kit and Claude Code, and each part has its own
spec, plan, task list, quality harness and evidence.

- **Demo video:** `<ADD DEMO VIDEO LINK HERE>`
- **GitHub repository:** `https://github.com/shwetakohad22/Assignment-1`

> [!WARNING]
> **No API key is included in this repository.** Part-1A does not need a key. Part-1B needs one
> only for `npm run eval` (and the manual agent check). See [Part-1B setup](#part-1b-setup-gemini-api-key).

---

## 1. What is in each part

### Part-1A – Todo / Task REST API

A small REST API to create, read, update, delete, filter and sort tasks. It is written in Node.js and
uses **only built-in Node.js modules** (no runtime dependencies; ESLint is the only dev dependency).
Tasks are saved to a JSON file. The spec defines 63 acceptance criteria (AC-01 to AC-63).

### Part-1B – Natural-Language Reminder Agent

A command-line agent that takes one plain-English message (for example
"Remind me to call mom tomorrow at 5pm") and returns **one structured JSON object**
(intent, task, date/time in Asia/Kolkata, status). It calls the **Google Gemini API** with the
built-in `fetch`. It has guardrails for malformed input and prompt injection, and an evaluation
harness that runs 25 fixed cases against the real model and gives a PASS / FAIL / INCONCLUSIVE / ERROR verdict.

---

## 2. Folder structure

```text
Assignment-1/
├── README.md                     ← this file
├── Part-1A/                      ← Todo / Task REST API
│   ├── .harness/sensor.js        ← quality harness (4 gates)
│   ├── .specify/memory/constitution.md
│   ├── specs/001-todo-task-api/  ← spec, plan, tasks, contracts, quickstart
│   ├── src/                      ← application code
│   ├── tests/                    ← node:test tests
│   ├── evidence/                 ← generations, failure, harness runs, harness-log.md
│   ├── eslint.config.js
│   └── package.json
└── Part-1B/                      ← Natural-Language Reminder Agent
    ├── .harness/                 ← evaluation harness (run-evals.js, evaluators, lib)
    ├── .specify/memory/constitution.md
    ├── specs/001-nl-reminder-agent/ ← spec, plan, tasks, contracts, quickstart
    ├── src/                      ← agent code (cli.js, agent.js, gemini-client.js, ...)
    ├── tests/                    ← unit + harness self-tests (fake model, no network)
    ├── prompts/system-prompt.md
    ├── evals/dataset.json        ← 25 evaluation cases
    ├── evidence/                 ← generations, failure, eval runs, harness-log.md
    ├── eslint.config.js
    └── package.json
```

---

## 3. Requirements

- **Node.js 22 or newer** (`node --version`). Both `package.json` files declare `"node": ">=22"`.
  Part-1B uses `node --env-file`, which older Node versions do not have.
- npm (only used to install ESLint).

---

## 4. Part-1A – how to run the harness

From the `Part-1A` folder:

```bash
cd Part-1A
npm install
node .harness/sensor.js
```

The sensor runs four gates. The exit code is `0` only when all four pass.

| # | Gate | What it checks |
|---|------|----------------|
| 1 | **Lint** | `npx eslint .` reports 0 errors. |
| 2 | **Security** | Scans `src/` and `tests/` for `eval`, `new Function`, `child_process`, `eslint-disable` comments, inline ESLint rule changes, private keys, URLs with a username and password, and hard-coded secrets. It also fails if a `.env` file exists in `Part-1A`. One use of `child_process` in `tests/helpers/server.js` is allowed by the documented exception **E-1** and is always printed as "ALLOWED". |
| 3 | **Tests** | `node --test` has 0 failed, 0 skipped, 0 todo, and no `.skip` / `.todo` / `.only` in `tests/`. |
| 4 | **Traceability** | Every acceptance criterion AC-01 to AC-63 is named by at least one test. |

Each run writes a new folder `evidence/harness-results/run-<timestamp>/` with one log per gate,
`run.log` and `summary.json`. It never overwrites older runs. The last saved run
(`run-2026-11-12T05-52-47-626Z`) shows **PASS, 4/4** (109 tests, 63/63 acceptance criteria covered).

Other scripts in `Part-1A/package.json` (optional): `npm test`, `npm run lint`, `npm start`
(starts the API on `http://127.0.0.1:3000`; see `specs/001-todo-task-api/quickstart.md`).

---

## 5. Part-1B – how to run the checks

### 5.1 Offline checks (no API key, no cost)

From the `Part-1B` folder:

```bash
cd Part-1B
npm install
npm run lint
npm test
```

- `npm run lint` runs `eslint .` (expected: 0 errors).
- `npm test` runs `node --test "tests/**/*.test.js"`. These tests use a **fake model and fake fetch**.
  They make no network call and **do not need a key or a `.env` file**. The final generation had
  217 tests, all passing.

### Part-1B setup (Gemini API key)

> [!IMPORTANT]
> - **No API key is included in this repository.** `.env` is listed in `.gitignore` and was never committed.
> - To run the live evaluation, create your **own** file `Part-1B/.env` with your **own** Gemini key:
>
>   ```text
>   GEMINI_API_KEY=your-own-key
>   GEMINI_MODEL=gemini-2.5-flash
>   ```
>
> - The recorded evaluation was run with **`GEMINI_MODEL=gemini-2.5-flash`**. If `GEMINI_MODEL` is not
>   set, the code uses its default, **`gemini-3.8-flash`** (see `src/config.js`), which never had a clean run.
> - The Gemini **free tier allows only 5 requests a minute and 20 requests a day**. The harness waits
>   13 seconds between cases, so **one run takes about 7 minutes**. Even so, a run can end with
>   **service failures** (HTTP 429, timeouts, 5xx). These are reported separately and never counted as passes.
>   A second run on the same day may hit the daily limit.
> - **Node.js 22 or newer** is needed (`npm run eval` uses `node --env-file=.env`).

### 5.2 Live evaluation (calls the real Gemini API)

```bash
npm run eval
```

This runs `node --env-file=.env .harness/run-evals.js`. It sends the 25 cases in `evals/dataset.json`
to Gemini (the 8 malformed and adversarial cases are answered by the guardrails without a model call).
It then:

- prints progress for each case and the final verdict (exit code `0` = PASS);
- updates `evidence/eval-results.json`;
- creates a new folder `evidence/eval-runs/run-<timestamp>/` with `eval-results.json` and `summary.md`
  (older run folders are not changed).

Pass rule (fixed in the spec before any run): overall score ≥ **0.80** **and** all 5 guardrail cases PASS.

Optional manual check of one message (PowerShell, also calls Gemini, from
`specs/001-nl-reminder-agent/quickstart.md`):

```powershell
'Remind me to call mom tomorrow at 5pm' | node --env-file=.env src/cli.js --reference-time 2026-11-12T10:00:00+05:30
```

---

## 6. Recorded live evaluation runs

From the `summary.md` file in each folder under `Part-1B/evidence/eval-runs/`:

| Run folder | Model | Verdict | Score | Notes |
|------------|-------|---------|-------|-------|
| `run-2026-11-13T04-46-48-342Z` | gemini-3.8-flash | **INCONCLUSIVE** (exit 3) | 0.32 (8/25 PASS) | 17 service failures (429, timeout, 5xx); guardrails 5/5 PASS |
| `run-2026-11-13T07-13-00-363Z` | gemini-2.5-flash-lite | **ERROR** (exit 2) | No score claimed (8/25 PASS) | 17 config errors: the model returned HTTP 404 for this key; guardrails 5/5 PASS |
| `run-2026-11-13T12-02-57-258Z` | gemini-2.5-flash | **PASS** (exit 0) | **0.96 (24/25 PASS)** | 1 service failure (EV-17, 429); guardrails 5/5 PASS; all quality gates PASS |

Between runs, only the pause between cases (spec 1.5, 1.6) and the model setting (`GEMINI_MODEL`) were
changed. The threshold, scoring, retries, guardrails, dataset and agent code were not changed.

---

## 7. Where to find the spec, plan, tasks and evidence

| Item | Part-1A | Part-1B |
|------|---------|---------|
| Constitution | `Part-1A/.specify/memory/constitution.md` | `Part-1B/.specify/memory/constitution.md` |
| Spec | `Part-1A/specs/001-todo-task-api/spec.md` | `Part-1B/specs/001-nl-reminder-agent/spec.md` |
| Plan | `Part-1A/specs/001-todo-task-api/plan.md` | `Part-1B/specs/001-nl-reminder-agent/plan.md` |
| Tasks | `Part-1A/specs/001-todo-task-api/tasks.md` | `Part-1B/specs/001-nl-reminder-agent/tasks.md` |
| Contracts / quickstart | `Part-1A/specs/001-todo-task-api/contracts/`, `quickstart.md` | `Part-1B/specs/001-nl-reminder-agent/contracts/`, `quickstart.md` |
| Initial generation | `Part-1A/evidence/initial-generation/` | `Part-1B/evidence/initial-generation/` |
| Final generation | `Part-1A/evidence/final-generation/` | `Part-1B/evidence/final-generation/` |
| Failure 1 (before repair) | `Part-1A/evidence/failure-1-before-repair/` | `Part-1B/evidence/failure-1-before-repair/` |
| Harness log | `Part-1A/evidence/harness-log.md` | `Part-1B/evidence/harness-log.md` |
| Harness / eval results | `Part-1A/evidence/harness-results/` | `Part-1B/evidence/eval-runs/`, `Part-1B/evidence/eval-results.json` |

The copies in `initial-generation/` and `final-generation/` save `.js` files as `.txt`, so that lint and the
security scan do not treat them as live code.

---

## 8. Known limitations

- **Free-tier limits (Part-1B):** 5 requests a minute and 20 a day. Rate-limit failures such as EV-17 can
  still happen, and a run can end INCONCLUSIVE for reasons outside the code.
- **Model results can vary (Part-1B):** the PASS applies to `gemini-2.5-flash` and one run of 25 cases.
  The code default `gemini-3.8-flash` never had a clean run.
- **Live test gaps (Part-1B):** some date phrases ("at 5" without am/pm, "noon", "midnight",
  "day after tomorrow", a date with no year, other time zones) are covered only by fake-model unit tests.
- **One time zone (Part-1B):** only Asia/Kolkata (IST) is supported.
- **Simple scoring (Part-1B):** the semantic check uses keyword matching, so a correct answer with
  different words can be marked as a fail.
- **Single user, no login (Part-1A):** the API stores data in one JSON file and has no authentication.
- **Part-1A open items:** the loader accepts stored task IDs of any length if the data file is edited by
  hand (finding N7); the graceful-shutdown task (T037) has no requirement or test.
- **Exception E-1 (both parts):** one narrow, documented use of `child_process` is allowed (the Part-1A
  test helper; the Part-1B evaluation runner). If that code changes shape, the exception no longer applies.
- **Tested on one machine (Part-1A):** tested only on Windows, on one machine.
