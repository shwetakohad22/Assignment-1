# Data Model: Natural-Language Reminder Agent

## Message

| Field | Type | Rules |
|-------|------|-------|
| text | string | All of stdin, decoded as UTF-8. Malformed if, after trimming, it is empty, has no `\p{L}` character, or is longer than 1000 characters (FR-02). |

## ReferenceContext

| Field | Type | Rules |
|-------|------|-------|
| referenceMs | number | UTC epoch ms, parsed from `--reference-time` (ISO 8601 **with** offset, `Z` allowed) or the current time if omitted (FR-05) |
| referenceIst | string | `YYYY-MM-DDTHH:mm:ss+05:30` form of the same instant |
| weekday | string | IST weekday of the reference date (prompt + calendar hint) |
| timezone | `"Asia/Kolkata"` | the only accepted value; anything else → `configuration_error` |

## Config

| Field | Source | Rules |
|-------|--------|-------|
| apiKey | `process.env.GEMINI_API_KEY` | Must be non-empty. Held in memory only and passed to the Gemini client and the post-check. Never serialised. |
| model | `process.env.GEMINI_MODEL` | Non-empty override, else `DEFAULT_MODEL` (`gemini-3.8-flash`, D-1 resolved by spec revision 1.2) |

## ModelReply (from Gemini, untrusted)

Exactly these 7 keys: `intent`, `status`, `task`, `datetime`, `snooze_minutes`,
`clarification_question`, `reason`. Any other key set, unparseable text, or a wrong type →
`invalid_model_output`. See [contracts/model-request.md](contracts/model-request.md).

## ReminderOutput (schema 1.0, emitted)

The 8 fields and the per-row rules are in spec FR-08/FR-09 and
[contracts/output.schema.json](contracts/output.schema.json). Validated by INV-01 to INV-13
before emission.

### State transitions inside the agent pipeline

```text
                 ┌─ config invalid ───────────────► ERROR(configuration_error)      exit 2
start ─ args/env ┤
                 └─ ok ─ input ─┬─ malformed ─────► CLARIFY(malformed_input)        exit 0
                                ├─ pre-check hit ─► REFUSED(guardrail_*)            exit 0
                                └─ model call ─┬─ 4xx except 408/429 ─► ERROR(configuration_error)  exit 2
                                               ├─ retries exhausted ► ERROR(model_service_failure) exit 3
                                               ├─ safety block ─────► REFUSED(guardrail_harmful)  exit 0
                                               └─ reply ─ normalize ┬─ non-conforming ► ERROR(invalid_model_output) exit 1
                                                                    ├─ past datetime ─► CLARIFY(past_time)
                                                                    ├─ snooze ∉ 1..1440 ► CLARIFY(out_of_range)
                                                                    ├─ model refusal ─► REFUSED(fixed GR-06 shape)
                                                                    └─ valid ─ post-check ┬─ key/canary ► REFUSED(guardrail_secret_request)
                                                                                          └─ ok ─ validateOutput ─► emit   exit 0
```

## AgentDiag (stderr line)

`AGENT_DIAG {"attempts": int 0–3, "failure_kind": null|"network"|"timeout"|"429"|"5xx",
"http_status": int|null, "model": string}`. `attempts` = 0 when no model call was made.
`failure_kind` `timeout` covers both an aborted attempt and HTTP 408 (spec v1.3 FR-40).

## EvaluationDataset (`evals/dataset.json`)

| Field | Type | Rules |
|-------|------|-------|
| dataset_version | string | `"1.0"` |
| spec_version | string | spec version the dataset belongs to (FR-20); must equal the spec header's **Spec Version** (currently `"1.6"`), checked by CHK-DATA (FR-23) |
| reference_time | string | must equal `2026-11-12T10:00:00+05:30` |
| timezone | string | must equal `Asia/Kolkata` |
| threshold | object | `{ "case_semantic": 0.8, "overall": 0.80, "all_guardrail_cases_must_pass": true }`, equal to the harness constants |
| cases | EvaluationCase[] | ≥ 15 (exactly 25 for v1.0), unique IDs, all 6 categories |

## EvaluationCase

| Field | Type | Rules |
|-------|------|-------|
| id | string | `EV-nn`, unique |
| category | enum | `normal`, `boundary`, `ambiguous`, `missing_info`, `malformed`, `adversarial` |
| guardrail | boolean | `true` for every `adversarial` case |
| input | string | the literal message (EV-18 = `""`; EV-20 = 1,200-character literal) |
| expected.intent / .status | string | one allowed value each |
| expected.reason | string[] \| null | acceptable reason codes, or null meaning reason must be null |
| expected.task_keywords | (string \| string[])[] \| null | FR-27 |
| expected.datetime | string \| null | IST ISO string |
| expected.snooze_minutes | int \| null | |
| traces_to | string[] | non-empty. Every ID must appear in `spec.md`. |

## CaseResult

| Field | Type | Notes |
|-------|------|-------|
| id, category, guardrail | | copied from the case |
| classification | `PASS` \| `FAIL` \| `SERVICE_FAILURE` \| `CONFIG_ERROR` | `CONFIG_ERROR` forces run verdict ERROR |
| exit_code | int \| null | null if killed |
| timed_out | boolean | 150 s harness kill |
| layer1 | `{ pass, failed: CHK-ID[] }` | CHK-SCH-01..04 |
| layer2 | `{ pass, failed: CHK-ID[] }` | CHK-INV-05..13, CHK-PROP-INTENT/STATUS/REASON |
| task_score, time_score | 0 \| 0.5 | CHK-SEM-TASK, CHK-SEM-TIME (always computed when stdout parsed) |
| semantic_score | 0 \| 0.5 \| 1.0 | |
| attempts | int \| null | from AGENT_DIAG |
| failure_kind | string \| null | for SERVICE_FAILURE |
| output | object \| null | parsed agent output (already secret-scanned) |

## EvaluationReport

Covered by FR-40. Fields: `spec_version`, `dataset_version`, `reference_time`, `model`,
`run_id`, `started_at`, `finished_at`, `threshold`, `cases: CaseResult[]`,
`totals {PASS, FAIL, SERVICE_FAILURE, CONFIG_ERROR}`, `service_failure_ids`, `overall_score`,
`best_case_score`, `guardrail_result {passed, total, all_pass}`, `verdict`, `verdict_reason`,
`exit_code`, `checks_map` (CHK → IDs), `dataset_errors` (when ERROR), `stderr_secret_hits`
(case IDs whose stderr failed CHK-SECRET, FR-24), `stdout_secret_hits` (case IDs whose raw
stdout failed CHK-SECRET; any hit makes the verdict ERROR, FR-34 since spec v1.4), `quality_gates` (7 constitution gates, each
`{ result: PASS|FAIL|NOT_EVALUATED, rule }`, FR-40; reported only), `notes`. See
[contracts/eval-report.md](contracts/eval-report.md).
