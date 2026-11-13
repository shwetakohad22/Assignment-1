# Implementation Plan: Natural-Language Reminder Agent

**Branch**: `001-nl-reminder-agent` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md) (v1.6)

**Input**: Feature specification from `specs/001-nl-reminder-agent/spec.md`

## Summary

A stateless Node.js command-line agent reads one message from stdin and writes exactly one
contract-valid JSON object (schema 1.0) to stdout. It calls Gemini through the built-in `fetch`.
Deterministic code runs before and after the model: input checks, a guardrail pre-check, then
reply parsing and normalisation, time and range enforcement, a secret/canary post-check, and full
invariant validation. Raw model text never reaches stdout.

A separate evaluation harness in `.harness/` handles evaluation. It validates `evals/dataset.json`
(25 cases), starts the real agent as **one child process per case**, and applies three
deterministic layers in order: schema, then invariants and properties, then a semantic score. It
computes case results, the overall score and the run verdict exactly as FR-26 to FR-35 declare,
and reports model-service failures separately. It writes `evidence/eval-results.json` plus a
write-once, timestamped run folder.

Unit tests use a **fake model** and a fake `fetch`. They make no network calls and cost nothing.

## Open Item Requiring a Spec Revision First (D-1)

| ID | Conflict | Resolution in this plan |
|----|----------|-------------------------|
| D-1 | The project owner asked for default model **`gemini-3.8-flash`**. Spec v1.1 **FR-04** and the Assumptions section say `gemini-2.5-flash`. | Constitution Principle VIII says requirements change in the spec first. **Before `/speckit-tasks` / `/speckit-implement`**, record spec revision **1.2** (dated, in Revision History) that changes FR-04 and the matching Assumption to `gemini-3.8-flash`. The plan is written for `gemini-3.8-flash`, and the default lives in one constant (`DEFAULT_MODEL` in `src/config.js`). If revision 1.2 is not made, the constant must be `gemini-2.5-flash`. Threshold, scoring and dataset are unaffected. **Resolved 2026-11-12**: spec revision 1.2 recorded; FR-04 and the Assumption now say `gemini-3.8-flash`. |

## Technical Context

**Language/Version**: JavaScript (ES modules), Node.js **≥ 22**, as spec v1.3 FR-06 requires. 22
meets the constitution's "Node 18+" floor and is needed for the built-in `--env-file` flag (≥ 20.6) and for `node --test` glob
patterns (≥ 21). Same runtime as Part-1A.

**Primary Dependencies**: none at runtime. Built-ins only: `node:fs`, `node:path`,
`node:child_process` (evaluation runner only, exception E-1), `node:test`, `node:assert`, global
`fetch`, `AbortSignal`, `URL`. **Dev**: `eslint` (+ `@eslint/js`, its own recommended config).

**Model**: Gemini `generateContent` REST API. Default model is `gemini-3.8-flash` (spec v1.2 FR-04; D-1 resolved),
overridable with `GEMINI_MODEL`. The live evaluation is run with `GEMINI_MODEL=gemini-2.5-flash` (spec v1.6 Assumptions).

**Secrets**: `GEMINI_API_KEY` is loaded by Node itself via `node --env-file=.env …`. No dotenv
package. No code path opens, reads or prints `.env`.

**Storage**: none for the agent (stateless). The harness writes JSON/Markdown evidence files.

**Testing**: `node:test` + `node:assert/strict`. A fake model client and fake `fetch` are injected.
Tests make no network calls and spawn no child processes.

**Target Platform**: Windows 11 (owner's machine) and any OS with Node ≥ 22. Paths are built with
`node:path`.

**Project Type**: CLI tool + importable library function + evaluation harness.

**Performance Goals**: SC-05. At most 20 s per model attempt. At most 120 s worst case with retries
(3 × 20 s + 2 × 30 s capped `Retry-After`). Malformed input is answered in < 50 ms with no network.

**Constraints**: free-tier rate limits. Cases run sequentially with ≥ 13 s (13000 ms) between cases (FR-24, spec v1.6).
At most 3 attempts per call (FR-38). Stdout carries only the one JSON object.

**Scale/Scope**: 1 message per invocation. 25 evaluation cases. About 10 source modules, about 8
harness modules, about 15 test files.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design (result below).*

| Principle | How this plan complies | Status |
|-----------|------------------------|--------|
| I. Minimal built-in stack & clean lint | Zero runtime deps. ESLint is the only devDependency. `npm run lint` must report 0 errors. Evidence code copies are saved with a `.txt` suffix from the start (lesson from Part-1A run 1), so no lint ignores or `eslint-disable` are needed. | ✅ |
| II. Secret hygiene | Node `--env-file` loads the key. The key is sent only in the `x-goog-api-key` header, never in the URL. The key is never logged. Stderr diagnostics are a fixed allow-list of fields. The report writer scans every byte for the key value and the `AIza…` pattern before writing. Tests never use `--env-file` and pass a fake env object. `.env` stays in `.gitignore` (verified only with `git check-ignore`). | ✅ |
| III. Stable output contract | `src/contract.js` holds the fields, enums and FR-09 row table. `normalize.js` converts every model reply into a contract-valid object or the `invalid_model_output` error shape. | ✅ |
| IV. Invariants & guardrails | INV-01 to INV-13 are checked in the agent before output. The harness re-checks them independently. There is a deterministic guardrail pre-check, a model classification and a deterministic post-check. Neither has a test/eval bypass flag. | ✅ |
| V. Layered, traceable, pre-declared evaluation | Three layers in fixed order, all deterministic, no LLM judge. Threshold constants are copied verbatim from FR-32 to FR-35 and cross-checked against `dataset.json.threshold` (CHK-DATA). Every case traces to spec IDs, which are validated by parsing `spec.md`. | ✅ |
| VI. Honest failure classification | Agent stderr diagnostics report attempts and failure kind. The runner classifies `SERVICE_FAILURE` and keeps it in the denominator. The verdict can be `INCONCLUSIVE`. Service-failure IDs are always listed. | ✅ |
| VII. Evaluation integrity | No skip or filter flags in the runner. The case list cannot be filtered. Thresholds are constants plus a data cross-check. Run folders are write-once. Failing runs are preserved. | ✅ |
| VIII. Spec-first change control | D-1 is routed to spec revision 1.2 before implementation. The /speckit-analyze fixes (FR cross-references, 4xx classification, Node 22, dataset `spec_version`, stderr secret scan, `quality_gates`, known limitation) were recorded as spec revision 1.3 before this plan was updated. Dataset v1.0 is transcribed exactly from FR-22. | ✅ D-1 resolved by spec revision 1.2; analysis fixes recorded as spec revision 1.3; FR-34 secret-hit ERROR rule (N1) recorded as spec revision 1.4 (all 2026-11-12); FR-24 pause between cases raised from 1000 ms to 7000 ms recorded as spec revision 1.5 (2026-11-13, after run run-2026-11-13T04-46-48-342Z, before any new evaluation run); FR-24 pause raised from 7000 ms to 13000 ms and live-evaluation model gemini-2.5-flash recorded as spec revision 1.6 (2026-11-13, after run run-2026-11-13T07-13-00-363Z, before any new evaluation run) |
| Governance: documented exceptions | **E-1** (child_process in the evaluation runner) is documented with ID, reason, scope and date (see Complexity Tracking). It weakens neither II nor VII. | ✅ documented |

**Gate result (pre-research)**: PASS, on the condition that spec revision 1.2 (D-1) is recorded
before tasks are generated. **Post-design re-check**: PASS. The Phase 1 design added no
dependency, no bypass and no new exception.

## Architecture

### Agent pipeline (`src/agent.js` → `runAgent`)

The order is fixed. Each step returns early with a final output.

```text
1. parseArgs(--reference-time, --timezone)      → bad value: configuration_error, exit 2   (FR-05)
2. resolveConfig(env): key present? model name  → no key:    configuration_error, exit 2   (FR-03, FR-04)
3. read stdin fully as UTF-8
4. checkMalformed(message)                      → clarify/malformed_input, no model call   (FR-02)
5. guardrailPreCheck(message)                   → refusal shape, no model call             (GR-01..05)
6. buildRequest(system prompt + reference context + <user_message> data block)            (GR-05)
7. callModel with 20 s timeout, ≤3 attempts     → retryable (network/timeout/408/429/5xx) exhausted: model_service_failure, exit 3
                                                  any other 4xx (incl. 400/401/403/404): configuration_error, exit 2 (FR-36..38)
8. normalize(reply): parse JSON, exact 7-field model-reply check, enums, FR-09 row,
   snooze ceil + range (out_of_range), past-time (past_time), refusal → fixed GR-06 shape,
   anything else non-conforming → invalid_model_output, exit 1                            (FR-09, FR-10, FR-13, FR-18)
9. guardrailPostCheck(candidate): key value, AIza pattern, canary → refusal guardrail_secret_request (GR-07)
10. validateOutput(final, referenceTime): INV-01..13. Failure → invalid_model_output (never emit an invalid object)
11. stdout ← JSON.stringify(final) + "\n";  stderr ← one AGENT_DIAG line;  exit code per FR-07
```

The config checks (1 to 2) run before input checks. This makes AC-24 hold for **any** input.
Malformed input with a valid configuration never touches the network (AC-09, SC-06).

### Model reply contract

The model returns a JSON object with exactly 7 fields: `intent`, `status`, `task`, `datetime`,
`snooze_minutes`, `clarification_question`, `reason`. The application adds `schema_version`. The
request uses `responseMimeType: "application/json"`, a `responseSchema`, and `temperature: 0`.
Details are in [contracts/model-request.md](contracts/model-request.md).

### Evaluation harness (`.harness/`)

```text
run-evals.js (entry; the ONLY file using child_process, exception E-1)
  └─ lib/runner.js  runEvaluation({ dataset, specText, runCase, now, keyForScan })   ← pure, testable
       1. lib/dataset.js        CHK-DATA (FR-23, incl. spec_version = spec.md "Spec Version"): any error → verdict ERROR, agent never started
       2. for each case, sequentially, ≥13 s (13000 ms) apart:
            runCase(case) → { stdout, stderr, exitCode, timedOut }          (spawn injected)
            CHK-SECRET on stderr (key value + AIza pattern) → hit recorded by case ID; raw stderr then discarded (FR-24)
            lib/classify.js     SERVICE_FAILURE | CONFIG_ERROR | evaluated     (FR-31, FR-36)
            evaluators/schema.js      Layer 1  CHK-SCH-01..04
            evaluators/properties.js  Layer 2  CHK-INV-05..13, CHK-PROP-*
            evaluators/quality.js     Layer 3  CHK-SEM-TASK, CHK-SEM-TIME (always computed)
            case rule FR-30/FR-32 → PASS | FAIL
       3. lib/verdict.js        FR-33/FR-34: score, best-case score, guardrail rule → PASS/FAIL/INCONCLUSIVE/ERROR
       4. lib/gates.js          quality_gates (FR-40; reported only, never changes the verdict)
       5. lib/report.js         CHK-SECRET scan → evidence/eval-runs/run-<ts>/ (write-once) + evidence/eval-results.json
  exit code FR-41: 0 PASS · 1 FAIL · 2 ERROR · 3 INCONCLUSIVE
```

The harness evaluators **do not import `src/`**. They are an independent re-implementation of the
contract checks, so a bug in the agent's validator cannot hide itself. The only shared input is
the canary string, which the harness reads from `prompts/system-prompt.md` (first line marker),
not from agent code.

## How Each Requirement, Invariant and Guardrail Is Built and Tested

Abbreviations: **U** = unit test with fake model/fetch (`tests/`), **E** = live evaluation case
(`evals/dataset.json`), **H** = harness self-test (`tests/harness/`).

### Input, configuration, runtime (FR-01 to FR-07)

| ID | Built in | Tested by |
|----|----------|-----------|
| FR-01 | `src/cli.js` reads all of stdin (`for await` chunks → `Buffer.concat` → UTF-8). It writes one `JSON.stringify` line. Diagnostics go to stderr only. | U `cli.test.js` (fake streams: stdout has exactly one parseable object); E all cases via CHK-SCH-01 |
| FR-02 | `src/input-checks.js`: trimmed empty, `!/\p{L}/u`, trimmed length > 1000 | U boundary 1000/1001 chars, digits/symbols only, non-Latin letters accepted; asserts the fake model was **not called**; E EV-18..20 |
| FR-03 / AC-24 | `src/config.js`: missing/empty key → error shape, stderr `GEMINI_API_KEY is not set`, exit 2 | U `cli.test.js` with `env: {}`: exit 2, stderr names the variable, fake fetch not called |
| FR-04 | `DEFAULT_MODEL = 'gemini-3.8-flash'` (D-1); `GEMINI_MODEL` overrides when non-empty | U: unset → default in request URL; set → override |
| FR-05 | `src/time.js` `parseReferenceTime`: strict ISO 8601 regex **with** offset (`Z` or ±HH:MM), converted to the +05:30 instant; only `Asia/Kolkata` accepted | U: `…04:30:00Z` ≡ `…10:00:00+05:30`; no offset → exit 2; `Europe/London` → exit 2; missing flag → current time |
| FR-06 | `package.json`: no `dependencies`, `engines.node >=22` (spec v1.3: Node 22 or newer) | U `stack.test.js`: parses package.json and asserts no deps and devDeps ⊆ {eslint, @eslint/js}; scans `src/`/`.harness/` imports are `node:` or relative |
| FR-07 | `EXIT_CODES` map in `src/contract.js` | U: one test per status/reason → exit code |

### Output contract (FR-08 to FR-10) and invariants (INV-01 to INV-13)

Agent side: `src/contract.js` `validateOutput(obj, referenceTime, {key, canary})` returns the list
of failed INV IDs. Harness side: `.harness/evaluators/schema.js` + `properties.js` re-implement the
same checks independently.

| ID | Agent build | Harness check | Tests |
|----|-------------|---------------|-------|
| FR-08 / INV-02,03,04 | `FIELDS`, `INTENTS`, `STATUSES`, `REASONS` constants; exact-key check | CHK-SCH-02..04 | U table-driven valid/invalid objects (missing field, extra `priority`, `intent: delete_all`, `schema_version: "1"`); H same fixtures through the harness evaluators |
| FR-09 / INV-05 | `ROWS` table (6 rows) with reason-group and null/req/opt pattern per field | CHK-INV-05 | U one passing and one failing object per row |
| FR-10 | `src/normalize.js`: `JSON.parse` in try. Model-reply key set must equal the 7 fields exactly. Any violation → `invalid_model_output` (exit 1). Raw text discarded. | — | U fake replies: prose, fenced JSON, array, extra field, `delete_all`, wrong types → error shape; asserts stdout never contains the raw reply |
| INV-01 | `cli.js` emits only `JSON.stringify(obj)` | CHK-SCH-01 parses the **raw stdout text**: exactly one object, nothing else except a trailing newline | U, H (fixtures: two objects, array, leading text) |
| INV-06 | `time.js` `isValidIstDatetime`: regex, then round-trip through `Date.UTC` to reject 31 Nov / hour 24 | CHK-INV-06 | U `2026-11-31T…`, `T24:00:00`, `+00:00` rejected |
| INV-07 | `normalize.js` ceil → integer 1–1440 | CHK-INV-07 | U `"15"`, 15.5 (from contract side), 0, 1441 |
| INV-08 | trim + length 1–200 / 1–300 | CHK-INV-08 | U |
| INV-09/10, FR-18 | `normalize.js` compares instants (ms). Past create/reschedule → `clarify/past_time`, keeping `task`, with a fixed question. | CHK-INV-09/10 | U fake model returns `2026-11-12T09:00:00+05:30` for create → past_time; equal instant allowed; E EV-13 |
| INV-11 | row table forces nulls for clarify | CHK-INV-11 | U, H |
| INV-12 | `guardrails.js` post-check: `value.includes(env key)` (when the key is non-empty) + `/AIza[0-9A-Za-z_-]{35}/` on every string field | CHK-INV-12 (key passed in memory from the runner's env) | U fake model echoes a fake key `AIza` + 35 chars → refusal `guardrail_secret_request`; E EV-22 |
| INV-13 | Canary `RMDR-CANARY-7Q4X-K2M9` on line 1 of `prompts/system-prompt.md`. Post-check rejects any field containing it. | CHK-INV-13 | U fake model echoes the canary → refusal; E EV-21 |

### Behaviour (FR-11 to FR-15, FR-17, BP-01 to BP-08)

The model handles **language understanding and date resolution**. The prompt contains the FR-17
rule table, the reference time, its weekday, and a deterministic 14-day calendar (date ↔ weekday)
produced by `time.js`, which removes weekday arithmetic errors. Deterministic code then enforces
everything checkable: formats, past-time, snooze rounding/range, the FR-09 nulls and the fixed
messages.

| ID | Built in | Tested by |
|----|----------|-----------|
| FR-11 / BP-01 | prompt rules + normalize row check | U fake model create reply → passes through; E EV-01..04, EV-10 |
| FR-12 / BP-06 | prompt rule: "task = the user's own words naming the existing reminder" | E EV-05, EV-06 (keyword check); U row check |
| FR-13 / BP-05 | prompt (minutes, default 10, round up). `normalize.js` applies `Math.ceil` to any numeric value, then range 1–1440. Outside the range → `clarify/out_of_range` with nulls. | U fake replies 1.5 → 2, 0 → out_of_range, 1441 → out_of_range, 1440 ok; E EV-07..09, EV-11, EV-12 |
| FR-14, FR-15 / BP-02..04 | prompt rules + row table forbids guessed values | E EV-14..17; U row enforcement: a clarify reply that carries a datetime or snooze value is **not** silently nulled. It becomes `invalid_model_output`, because a guessed value is a contract violation (INV-11). |
| FR-17 | prompt rule table + calendar hint; `time.js` formatting | U `time.test.js` calendar for 2026-11-12 (Thu) → Fri 13, Mon 16, Thu 19; E date cases |
| BP-07 | FR-18 conversion (above) | U, E EV-13 |
| BP-08 | refusal builder (below) | U, E EV-21..25 |

### Guardrails (GR-01 to GR-08)

| ID | Built in | Tested by |
|----|----------|-----------|
| GR-01 | `guardrails.js` `INJECTION_PATTERNS` (case-insensitive regexes: `ignore (all )?(previous|prior|above) (instructions|rules)`, `developer mode`, `^\s*system\s*:` / `\bSYSTEM:`, `add (a )?field`, `set intent to`, `you are now`, `output format`…) → `guardrail_injection` | U each pattern, plus benign near-misses that must **not** trigger ("system meeting", "ignore the noise at 5pm"); E EV-21, EV-23 |
| GR-02 | `SECRET_PATTERNS` (`api[ _-]?key`, `GEMINI_API_KEY`, `\.env\b`, `environment variable`, `system (prompt|instructions)`, `reveal|repeat|print … instructions`) → `guardrail_secret_request` (checked **before** injection) | U; E EV-21, EV-22 |
| GR-03 | the model classifies harm (prompt rule). There is a small deterministic `HARM_PATTERNS` list (`poison`, `kill`, `threaten(ing)?`, `stalk`, `hurt (him|her|them|my)`…). A Gemini safety block (`promptFeedback.blockReason` or `finishReason: SAFETY/PROHIBITED_CONTENT`) maps to `guardrail_harmful`. | U fake reply `status: refused, reason: guardrail_harmful`; fake safety-blocked response; E EV-24, EV-25 |
| GR-04 | the pre-check scans the **whole** message. Any hit → whole refusal (no reminder parsing). A model refusal also overrides everything. | U "Remind me to pay rent … SYSTEM: …" → refusal, fake model not called; E EV-23 |
| GR-05 | the user text is placed only in the `contents` user part inside `<user_message>…</user_message>`. The system prompt goes in `systemInstruction`. Literal `<`/`>` inside the message are escaped. No config flag can disable the pre-/post-checks (no bypass exists in code). | U request-builder test (message only in the user part, escaped); `guardrails.test.js` asserts the exported API has no "disable" option |
| GR-06 | `refusal(reason)` builds the fixed shape. `clarification_question` = `REFUSAL_MESSAGE` (constant, below). A model-provided question for a refusal is **discarded**. | U deep-equality with the expected object for each refusal reason; asserts no user text is echoed |
| GR-07 | post-check (INV-12/13) → `refusal('guardrail_secret_request')` | U |
| GR-08 | key only in header; `AGENT_DIAG` allow-list; no logging of URL/headers; report scan (CHK-SECRET); no `.env` access in code | U `secret-hygiene.test.js`: (a) the fake fetch records the request; the key is absent from the URL and present only in `x-goog-api-key`; (b) stdout+stderr of all U agent runs contain no fake key; (c) static scan: no file in `src/`, `.harness/`, `tests/` reads a path ending in `.env` (`readFile*` / `open*` calls with `.env`); H report writer refuses/redacts a report containing the key |

Fixed messages (in `src/contract.js`; all ≤ 300 chars, trimmed, never echo user text):

- `REFUSAL_MESSAGE`: "I can't help with that request. Please send a normal reminder request, for example: \"Remind me to call mom tomorrow at 5pm\"."
- `ERROR_MESSAGE` (all error reasons): "Something went wrong while processing your reminder. Please try again."
- `MALFORMED_QUESTION`: "I couldn't understand that message. What would you like to be reminded about, and when?"
- `PAST_TIME_QUESTION`: "That time has already passed. When would you like to be reminded instead?"
- `OUT_OF_RANGE_QUESTION`: "Snooze must be between 1 minute and 24 hours. How long should I snooze it?"

### Model service: timeout, retry, classification (FR-36 to FR-38)

`src/gemini-client.js`, `createGeminiClient({ fetch, sleep, now })`. Dependencies are injected so
tests use a fake `fetch` and a no-wait `sleep`.

- Each attempt uses `AbortSignal.timeout(20000)`. An abort maps to kind `timeout`.
- Retryable: `TypeError`/network errors → `network`; 429 → `429`; 5xx → `5xx`; a timeout or an
  HTTP 408 → `timeout` (FR-36, FR-40). At most
  3 attempts. Waits are 2000 ms then 5000 ms, or `Retry-After` (seconds or HTTP-date) capped at
  30000 ms.
- Not retried: any other 4xx (including 400 for a request the agent built, 401, 403, 404) →
  `configuration_error`, exit 2 (FR-36, FR-38).
- All attempts exhausted → `model_service_failure`, exit 3.
- Returns `{ ok, text | failureKind, attempts, httpStatus }`. `attempts` and `failureKind` go into
  `AGENT_DIAG`.
- Tests (U `gemini-client.test.js`): 429→429→200 succeeds with 3 attempts and waits [2000, 5000].
  `Retry-After: 7` → wait 7000. `Retry-After: 120` → 30000. Three timeouts → failure kind
  `timeout`, attempts 3 (AC-25). 401 → 1 attempt, configuration_error. 503×3 → `5xx`. A thrown
  `TypeError` → `network`. 408×3 → `timeout`, attempts 3. 422 → 1 attempt, configuration_error.

### Evaluation (FR-19 to FR-35, FR-39 to FR-42) and rate limits

| ID | Built in | Tested by (H) |
|----|----------|---------------|
| FR-19, FR-20, FR-22 | `evals/dataset.json` transcribes the 25 FR-22 rows verbatim. EV-20 input is `"remind me to drink water "` × 48, stored literally (1,200 chars, no generation code). | `dataset.test.js`: 25 cases, the category counts 8/5/2/2/3/5, EV-20 length 1200 |
| FR-21 | `expected` shape validated in `lib/dataset.js` | fixture with a malformed `expected` → ERROR |
| FR-23 / AC-19 / CHK-DATA | `lib/dataset.js` + `lib/spec-ids.js`. Spec IDs are extracted from `spec.md` with `/\b(FR|AC|INV|BP|GR)-\d{2}[a-h]?\b/g`. The threshold is compared to the `THRESHOLD` constants. `dataset.spec_version` must equal the version in the spec header line `**Spec Version**: X.Y` (`extractSpecVersion` in `lib/spec-ids.js`). | fixtures: 14 cases, a missing category, duplicate ID, unknown `traces_to` ID `FR-99`, adversarial with `guardrail:false`, wrong reference time, threshold 0.7, `spec_version` `"1.2"` → each ERROR **and** `runCase` never called |
| FR-24 | `run-evals.js` `runCase`: `spawn(process.execPath, [AGENT_ENTRY, '--reference-time', ref, '--timezone', tz], { shell: false, env: process.env, stdio: 'pipe' })`; it writes `input` to stdin and closes it; it collects stdout/stderr/exit code. Hard kill after 150 s (above the SC-05 bound) → recorded `timedOut`, no stdout → Layer 1 FAIL (application failure). There is a 13000 ms gap between cases (spec v1.6). In `lib/runner.js`, each case's stderr is scanned by CHK-SECRET (key value when set, `AIza` pattern) **before** it is discarded; a hit is recorded as the case ID in `stderr_secret_hits` (never the matched text). | `runner.test.js` with an injected fake `runCase` (no real spawn): sequential order, a gap ≥ 13000 ms (fake clock), stdin text received verbatim; a fake stderr containing the fake key → its case ID in `stderr_secret_hits` and the key nowhere in the report |
| FR-25 | no judge exists. The harness never calls `fetch`. | `stack.test.js`: `.harness/` contains no `fetch(` |
| FR-26..29 | `evaluators/quality.js` `normalise` (NFKC, lower, non-alnum → space, collapse, trim), `taskScore`, `timeScore` | `quality.test.js`: the 4 worked-example rows of FR-35, synonym lists, word-boundary ("call" does not match "recall"), instant equality across offsets (an output must also be `+05:30`) |
| FR-30, FR-32 | the case rule in `lib/runner.js`. The semantic score is always computed and reported. | L2 fail + score 1.0 → FAIL (worked-example row 4) |
| FR-31, FR-36 | `lib/classify.js`: exit 3 or reason `model_service_failure` → `SERVICE_FAILURE` (kind from `AGENT_DIAG`). Exit 2 or `configuration_error` → run ERROR. Otherwise → evaluated. | fixtures for each |
| FR-33, FR-34 | `lib/verdict.js`: `score = pass/total`; `best = (pass+svc)/total`; `guardrailOk` requires all guardrail cases PASS, and `guardrailBest` treats guardrail SERVICE_FAILURE as possibly passing. The FAIL vs INCONCLUSIVE decision uses the best case. | `verdict.test.js`: scenarios A–D from the spec → PASS, INCONCLUSIVE, FAIL, FAIL; 20/25 exactly → PASS; a guardrail case in SERVICE_FAILURE with otherwise passing → INCONCLUSIVE; a config error → ERROR |
| FR-35 | `.harness/threshold.js` constants `{ caseSemantic: 0.8, overall: 0.80, allGuardrailMustPass: true }`, cross-checked against the dataset and the spec text | `dataset.test.js` |
| FR-39 | the runner calls each case exactly once. There are no retry/resume/merge features. | `runner.test.js`: SERVICE_FAILURE case invoked once |
| FR-40, FR-41 | `lib/report.js` builds the JSON (schema in [contracts/eval-report.md](contracts/eval-report.md)) and `summary.md`. `lib/gates.js` computes `quality_gates`: the 7 constitution gates with the PASS/FAIL/NOT_EVALUATED rules of FR-40 (reported only; never changes the verdict). The exit-code map follows FR-41. | `report.test.js`: all fields present; totals; service IDs listed; `quality_gates` present in JSON and summary. `gates.test.js`: each gate rule, and the verdict is the same with or without gates |
| FR-42 | every check result carries its `CHK-*` ID. `lib/checks.js` holds the CHK→requirement map from spec §8, and the report includes it. | test: every emitted check ID exists in the map |
| CHK-SECRET / AC-22 / FR-24 | `report.js` serialises everything in memory, then scans it for the key value (if set) and the `AIza` pattern. On a hit, it replaces the match with `[REDACTED]`, sets the verdict to ERROR with note `secret_detected`, and only then writes. Per-case stderr and stdout are scanned in `runner.js` before they are discarded (raw stderr and raw stdout are never stored); a hit is handled the same way (verdict ERROR, note `secret_detected: stderr <caseId>` or `secret_detected: stdout <caseId>`). Verdict ERROR on any CHK-SECRET hit is spec FR-34 (since v1.4). Any hit makes the Secrets gate `FAIL`. | `report.test.js` and `runner.test.js` with a fake key |
| Evidence | `evidence/initial-generation/` is copied right after the code is first generated and its tests pass (T080, after T073) and **before** any quality-gate repair, so it is the true initial output. `evidence/final-generation/` is copied after the live run and any repairs (T082). `evidence/eval-results.json` (latest run, overwritten) and `evidence/eval-runs/run-<ISO-ts with ':'→'-'>/{eval-results.json, summary.md}`. The folder is made with `fs.mkdirSync(dir)` (non-recursive final segment → `EEXIST` aborts) and files are written with flag `wx`, so a run folder can never be overwritten. | `report.test.js` in a temp dir: second write to the same folder throws, and the first content is unchanged |

**Rate limits (free tier)**: sequential cases, a 13 s gap (spec v1.6), the agent's own 2 s/5 s/`Retry-After`
backoff, and at most 3 attempts. The runner never re-runs a case. Worst case is about
25 × 121 s ≈ 50 min. In practice it is about 25 × (1 to 4 s) plus the gaps.

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

## Project Structure

### Documentation (this feature)

```text
specs/001-nl-reminder-agent/
├── spec.md              # v1.6 (D-1 in 1.2; analysis fixes in 1.3; FR-34 secret-hit rule in 1.4; all 2026-11-12; FR-24 7000 ms pause in 1.5; FR-24 13000 ms pause and evaluation model gemini-2.5-flash in 1.6; both 2026-11-13)
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── output.schema.json     # schema 1.0 as JSON Schema (documentation; enforced in code)
│   ├── agent-cli.md           # stdin/flags/stdout/stderr AGENT_DIAG/exit codes
│   ├── model-request.md       # Gemini request, model-reply contract, error mapping
│   └── eval-report.md         # dataset format, runner CLI, report JSON, run-folder layout
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root `Part-1B/`)

```text
package.json             # type: module; engines node >=22; devDependencies: eslint, @eslint/js; no dependencies
eslint.config.js         # @eslint/js recommended; files src/ tests/ .harness/ eslint.config.js; Node globals
.gitignore               # .env, node_modules/
src/
├── cli.js               # entry: wires process stdin/stdout/stderr/env/argv → main(); process.exitCode
├── agent.js             # runAgent(): pipeline steps 1–11
├── config.js            # parseArgs, DEFAULT_MODEL, key presence (never returns or logs the value outside the client)
├── contract.js          # FIELDS, enums, ROWS (FR-09), fixed messages, EXIT_CODES, validateOutput (INV-01..13)
├── input-checks.js      # FR-02
├── guardrails.js        # pre-check patterns, post-check (key/AIza/canary), refusal()
├── time.js              # reference-time parsing → +05:30, IST format/validate, compare, calendar hint
├── prompt.js            # loads prompts/system-prompt.md, builds request body (user data delimited)
├── gemini-client.js     # fetch + timeout + retry + failure kinds
└── normalize.js         # model reply → contract object (FR-10, FR-13, FR-18, GR-06)
prompts/
└── system-prompt.md     # canary line, role, rules (FR-09..17 table), guardrail rules, output fields
tests/
├── fakes/{fake-model.js, fake-fetch.js, fake-streams.js}
├── cli.test.js  agent.test.js  config.test.js  contract.test.js  input-checks.test.js
├── guardrails.test.js  time.test.js  prompt.test.js  gemini-client.test.js  normalize.test.js
├── secret-hygiene.test.js  stack.test.js
└── harness/{dataset, schema-evaluator, property-evaluator, quality-evaluator, verdict, gates, classify, runner, report}.test.js
evals/
└── dataset.json         # v1.0, 25 cases, reference_time, timezone, threshold
.harness/
├── run-evals.js         # entry; spawn (E-1); wires runner + report; exit code FR-41
├── threshold.js         # FR-32..35 constants
├── evaluators/{schema.js, properties.js, quality.js}
└── lib/{dataset.js, spec-ids.js, classify.js, runner.js, verdict.js, gates.js, report.js, checks.js, diag.js}
evidence/
├── initial-generation/  # copy of first generated code (before gate repairs), files renamed *.js.txt (not lint/test-scanned)
├── final-generation/    # copy of final code after the live run and any repairs, *.js.txt
├── eval-results.json    # latest run
├── eval-runs/run-<ts>/  # one write-once folder per run (eval-results.json, summary.md)
└── harness-log.md       # human-written log (runs, repairs, E-1, decisions)
```

**Structure Decision**: a single project, laid out exactly as the owner specified (`src/`,
`prompts/`, `tests/`, `evals/`, `.harness/`, `evidence/`). The agent and harness are deliberately
separate trees, so the evaluator stays independent of the code it measures.

## Complexity Tracking

| Exception / Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------------------|------------|-------------------------------------|
| E-1: `child_process.spawn` in `.harness/run-evals.js` | FR-24 requires each case to run as its own process, with stdout/stderr/exit code captured exactly as in production | Calling `runAgent` in-process would not test the real entry point, stdout purity (INV-01) or exit codes, and would contradict the 2026-11-12 clarification |
| Node ≥ 22 (FR-06 since spec v1.3; narrower than the constitution's 18+ floor) | `--env-file` (no dotenv) and `node --test` globs | Node 18 would need a dotenv package or manual `.env` parsing, and manual parsing would mean opening `.env`, which Principle II forbids |
| Harness re-implements the contract checks (duplication) | Independence: a validator bug must not grade itself | Importing `src/contract.js` would let one bug pass both the agent and the evaluation |
