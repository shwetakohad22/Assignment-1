# Phase 0 Research: Natural-Language Reminder Agent

All Technical Context items are resolved. No `NEEDS CLARIFICATION` remains.

## R-01 Default model (conflict D-1)

- **Decision**: default `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. A single constant
  holds the default.
- **Rationale**: this is the project owner's instruction for the plan. Spec v1.1 FR-04 still says
  `gemini-2.5-flash`, so Constitution VIII requires spec revision 1.2 **before** implementation.
- **Alternatives**: keep `gemini-2.5-flash` (contradicts the owner's instruction); change code
  without a spec revision (violates VIII).
- **Status (2026-11-12)**: resolved. Spec revision 1.2 changed FR-04 and the Assumption to
  `gemini-3.8-flash` (the model name shown as current in Google AI Studio on 2026-11-12).

## R-02 Gemini REST call with built-in fetch

- **Decision**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
  The key goes in the `x-goog-api-key` header. The model name is URL-encoded. The body has
  `systemInstruction`, one `contents` user part, and
  `generationConfig { temperature: 0, responseMimeType: "application/json", responseSchema }`.
- **Rationale**: a header keeps the key out of URLs, so a URL in an error or log cannot leak it
  (GR-08). JSON mode plus a response schema greatly reduces unparseable replies. Temperature 0
  minimises variance (spec Assumptions).
- **Alternatives**: the `?key=` query parameter (rejected: the key would be in the URL); the SDK
  package (rejected: Principle I).
- **Note**: no low `maxOutputTokens` cap, because thinking-capable models spend output tokens on
  reasoning and a cap could truncate the JSON. The reply text is read from
  `candidates[0].content.parts[*].text` (concatenated). If there is no candidate or text, the
  result is `invalid_model_output`, unless it is a safety block (R-09).

## R-03 Loading the key: `node --env-file`

- **Decision**: npm scripts `agent` = `node --env-file=.env src/cli.js` and `eval` =
  `node --env-file=.env .harness/run-evals.js`. Child processes inherit `process.env` from the
  runner. Code only ever reads `process.env.GEMINI_API_KEY`.
- **Rationale**: Node parses the file itself, so no project code opens `.env` (Principle II, user
  instruction). Requires Node ≥ 20.6, and the plan uses ≥ 22.
- **Alternatives**: the dotenv package (forbidden); manual parsing (would open `.env`).
- **Limitation recorded**: CHK-SECRET can check for the key value (in memory) and the `AIza`
  pattern. It cannot compare against "the contents of `.env`" without reading the file, which is
  forbidden. Since `GEMINI_API_KEY` is the only secret in `.env`, the key-value check covers
  AC-22. This is stated in the report's `notes`.

## R-04 Timeout and retry

- **Decision**: `AbortSignal.timeout(20000)` per attempt. Waits are 2 s and 5 s, or `Retry-After`
  (delta-seconds or HTTP-date) capped at 30 s. `fetch` and `sleep` are injected for tests.
  Retryable (spec v1.3 FR-36/FR-38): network errors, timeouts, HTTP 408 (kind `timeout`), 429 and
  5xx. Any other 4xx — including a 400 for a request the agent itself built, 401, 403 and 404 — is
  a `configuration_error` with no retry.
- **Rationale**: FR-36 to FR-38 exactly. Injection keeps tests deterministic and instant.
- **Alternatives**: a manual `AbortController` + `setTimeout` (equivalent, more code); exponential
  backoff with jitter (not what the spec declares).

## R-05 Date handling without libraries

- **Decision**: all times are handled as UTC epoch milliseconds. IST is a fixed offset of
  +330 minutes (no DST), so formatting means `new Date(ms + 19_800_000)` read with the `getUTC*`
  methods, then `+05:30` appended. Validation means regex, then rebuild with `Date.UTC`, then
  compare components (rejects 31 Nov, hour 24).
- **Rationale**: deterministic and platform-independent. `Intl` timezone data is not needed for a
  fixed offset.
- **Alternatives**: `Intl.DateTimeFormat` with `timeZone` (works, but needless for a fixed offset
  and harder to reason about).

## R-06 Who resolves relative dates

- **Decision**: the model resolves expressions using the FR-17 rule table in the prompt, the
  reference time with its weekday, and a deterministic 14-day calendar hint. Code enforces format,
  real date, past-time and snooze range afterwards (FR-18).
- **Rationale**: free-text understanding is the model's job, and the deterministic post-checks
  guarantee the invariants regardless. The calendar removes the most common LLM error (weekday
  arithmetic).
- **Alternatives**: a full deterministic natural-language date parser (large, brittle with free
  text, out of scope); trusting the model without post-checks (violates FR-18).

## R-07 Model-reply contract

- **Decision**: the model returns exactly 7 fields (all contract fields except `schema_version`,
  which the application adds). Refusal and error questions from the model are replaced by fixed
  messages. Fractional snooze values are ceiled by code.
- **Rationale**: fewer fields for the model to get wrong, and the contract version is owned by the
  application (FR-10).
- **Alternatives**: the model returns all 8 (adds one more failure mode for no gain).

## R-08 Guardrail detection strategy

- **Decision**: three stages. (1) A deterministic pre-check with regex lists (secret first, then
  injection, then a small harm list), which refuses before any model call. (2) Model
  classification via prompt rules (status `refused` + reason). (3) A deterministic post-check for
  the key value, the `AIza` pattern and the canary. There is no switch to disable any stage.
- **Rationale**: GR-05 requires the combination. The pre-check saves quota and is independent of
  model behaviour. The post-check is the final defence for INV-12/13.
- **Alternatives**: model only (non-deterministic, would fail GR-05); regex only (misses
  paraphrased harm).
- **Canary**: `RMDR-CANARY-7Q4X-K2M9`, the first line of `prompts/system-prompt.md`. The harness
  reads it from the same file, so there is one source of truth and no import of agent code.

## R-09 Gemini safety blocks

- **Decision**: `promptFeedback.blockReason` set, or a candidate `finishReason` of `SAFETY`,
  `PROHIBITED_CONTENT` or `BLOCKLIST`, maps to the refusal shape with `guardrail_harmful`. An HTTP
  200 with any other empty or garbled body → `invalid_model_output`.
- **Rationale**: a safety block is the model service's own harm classification (GR-03/GR-05).
  Treating it as a malformed reply would mislabel a correct refusal as an application error.
- **Alternatives**: `invalid_model_output` (wrongly fails EV-24/25 when the block works as intended).

## R-10 Evaluation runner: process model and exception E-1

- **Decision**: `spawn(process.execPath, [src/cli.js, flags…], { shell: false })` with the input
  on stdin. The spawn lives only in `.harness/run-evals.js`. All logic is in a pure `runner.js`
  with an injected `runCase`. There is a 150 s hard kill.
- **Rationale**: this is what FR-24 and the clarification require. Isolating the spawn keeps the
  documented exception E-1 to one file and one call, and lets tests run without spawning.
- **Alternatives**: `exec`/shell (injection surface, rejected); in-process calls (not
  end-to-end); spawning in tests (would need a second exception).

## R-11 Diagnostics channel from agent to runner

- **Decision**: the agent writes exactly one stderr line,
  `AGENT_DIAG {"attempts":n,"failure_kind":null|"network"|"timeout"|"429"|"5xx","http_status":n|null,"model":"…"}`,
  plus an optional human message for configuration errors. The fields come from an allow-list, so
  the line never contains the key, URL or headers. `failure_kind` `timeout` also covers HTTP 408
  (spec v1.3 FR-40).
- **Rationale**: FR-40 needs attempts and failure kind per case, and stdout must stay pure
  (INV-01).
- **Alternatives**: extra stdout fields (violates INV-03); exit codes alone (lose the kind and
  attempts).

## R-12 Write-once evidence

- **Decision**: `evidence/eval-runs/run-<ISO timestamp, ':' and '.' → '-'>/` is created with
  non-recursive `mkdirSync` on the final segment, and files use the `wx` flag.
  `evidence/eval-results.json` is the "latest" copy and is overwritten by design. Evidence code
  snapshots use the `.js.txt` suffix. `evidence/initial-generation/` is taken right after the
  code first passes its tests and before any quality-gate repair; `evidence/final-generation/` is
  taken after the live run and any repairs.
- **Rationale**: the user requires that run folders are never overwritten. `.txt` copies avoid the
  Part-1A run-1 failure where evidence copies were linted and tested as live code.
- **Alternatives**: a lint ignore entry for `evidence/` (works, but is a lint configuration
  change, which Principle VII asks to avoid).

## R-13 Independent harness evaluators

- **Decision**: the `.harness/evaluators/*` modules implement the INV/CHK checks themselves,
  without importing `src/`.
- **Rationale**: an evaluator that shares code with the system under test cannot catch that
  code's bugs (Principle V).
- **Alternatives**: a shared contract module (less code, but no independent verification).

## R-14 Lint configuration

- **Decision**: ESLint 9 flat config with `@eslint/js` recommended, applied to `src/**`,
  `tests/**`, `.harness/**` and `eslint.config.js`. Node globals are declared (`process`,
  `console`, `Buffer`, `URL`, `fetch`, `AbortSignal`, `setTimeout`, `clearTimeout`, `TextDecoder`,
  `DOMException`, `structuredClone`). No `eslint-disable` comments anywhere.
- **Rationale**: the same baseline as Part-1A, which is known to work on this machine.
  `DOMException` (timeout tests) and `structuredClone` (dataset fixture copies) are used by the
  tests; without them `no-undef` would fail the lint gate.

## R-15 Quality-gate reporting and stderr secret scan

- **Decision**: `.harness/lib/gates.js` computes the `quality_gates` section of the report from
  data the runner already has (CHK-SECRET hits, layer results, dataset errors, check IDs,
  service-failure list, verdict), using the PASS/FAIL/NOT_EVALUATED rules of spec v1.3 FR-40. The
  lint gate is `NOT_EVALUATED` by the harness (lint is a separate, recorded run). Each case's
  stderr is scanned by CHK-SECRET in `runner.js` before it is discarded (FR-24).
- **Rationale**: the constitution's Governance section requires every evaluation report to state
  each Quality Gate's result. Gates are reported only, so the pre-declared verdict rules
  (FR-30 to FR-34) are unchanged. Scanning stderr closes the one channel the report scan could not
  see, because raw stderr is never stored.
- **Alternatives**: running ESLint from the harness (would need a child process outside E-1);
  storing raw stderr and scanning the report (stores untrusted text in evidence).
