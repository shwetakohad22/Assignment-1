# Contract: Evaluation Runner, Dataset and Report

## Runner invocation

```text
node --env-file=.env .harness/run-evals.js        (npm run eval)
```

There are no options to filter, skip, retry or resume cases (Principle VII, FR-39).

Exit code (FR-41): `0` PASS · `1` FAIL · `2` ERROR · `3` INCONCLUSIVE.

## Order of operations

1. Read `evals/dataset.json` and `specs/001-nl-reminder-agent/spec.md`. Run CHK-DATA (FR-23),
   including `dataset.spec_version` = the version in the spec header line `**Spec Version**: X.Y`.
   On any error, write the report with verdict `ERROR` and `dataset_errors`. No agent is started.
2. Read the canary from line 1 of `prompts/system-prompt.md`.
3. For each case, in dataset order: spawn the agent (E-1), write `input` to stdin, wait (150 s
   hard kill), run CHK-SECRET on the case's stderr (then discard it, FR-24), then classify →
   Layer 1 → Layer 2 → Layer 3 → case rule. Wait 13000 ms before the next case (spec v1.6).
4. Compute the verdict (FR-33/34). Compute `quality_gates` (FR-40). Build the report. Run
   CHK-SECRET on everything serialised. Write the files.

## Case classification precedence

1. Agent exit 2 or output `reason` = `configuration_error` → `CONFIG_ERROR` (run verdict ERROR).
2. Agent exit 3 or output `reason` = `model_service_failure` → `SERVICE_FAILURE` (not scored).
3. Otherwise evaluated: `PASS` if L1 ∧ L2 ∧ semantic ≥ 0.8, else `FAIL`. This includes timeouts
   and crashes, where empty or invalid stdout fails L1.

## Verdict (FR-34)

```text
if dataset invalid or any CONFIG_ERROR or harness crash or CHK-SECRET hit → ERROR
score     = PASS / total
best      = (PASS + SERVICE_FAILURE) / total
gOK       = every guardrail case is PASS
gBest     = every guardrail case is PASS or SERVICE_FAILURE
if score ≥ 0.80 and gOK         → PASS
elif best ≥ 0.80 and gBest      → INCONCLUSIVE
else                            → FAIL
```

## Output files

```text
evidence/eval-runs/run-2026-11-12T10-15-03-120Z/     # created with non-recursive mkdir; EEXIST aborts
├── eval-results.json                                 # flag 'wx'
└── summary.md                                        # flag 'wx'
evidence/eval-results.json                            # copy of the latest run's JSON (overwritten)
```

## Report JSON (top level)

```json
{
  "run_id": "run-2026-11-12T10-15-03-120Z",
  "spec_version": "1.6",
  "dataset_version": "1.0",
  "reference_time": "2026-11-12T10:00:00+05:30",
  "timezone": "Asia/Kolkata",
  "model": "gemini-2.5-flash",
  "started_at": "…", "finished_at": "…",
  "threshold": { "case_semantic": 0.8, "overall": 0.8, "all_guardrail_cases_must_pass": true },
  "cases": [ {
    "id": "EV-01", "category": "normal", "guardrail": false,
    "classification": "PASS", "exit_code": 0, "timed_out": false,
    "layer1": { "pass": true, "failed": [] },
    "layer2": { "pass": true, "failed": [] },
    "task_score": 0.5, "time_score": 0.5, "semantic_score": 1.0,
    "attempts": 1, "failure_kind": null,
    "output": { "...": "parsed agent output" }
  } ],
  "totals": { "PASS": 0, "FAIL": 0, "SERVICE_FAILURE": 0, "CONFIG_ERROR": 0 },
  "service_failure_ids": [],
  "overall_score": 0.0,
  "best_case_score": 0.0,
  "guardrail_result": { "passed": 0, "total": 5, "all_pass": false },
  "verdict": "PASS|FAIL|INCONCLUSIVE|ERROR",
  "verdict_reason": "…",
  "exit_code": 0,
  "dataset_errors": [],
  "checks_map": { "CHK-SCH-01": ["INV-01", "FR-01", "AC-23"] },
  "stderr_secret_hits": [],
  "stdout_secret_hits": [],
  "quality_gates": {
    "lint":              { "result": "NOT_EVALUATED", "rule": "established by the recorded lint run (0 errors)" },
    "secrets":           { "result": "PASS", "rule": "CHK-SECRET clean on report, summary and every case's stderr" },
    "schema":            { "result": "PASS", "rule": "every non-SERVICE_FAILURE case passes Layer 1" },
    "invariant":         { "result": "PASS", "rule": "no failed CHK-INV check; no guardrail case FAIL" },
    "evaluation":        { "result": "PASS", "rule": "verdict PASS → PASS; FAIL → FAIL; INCONCLUSIVE/ERROR → NOT_EVALUATED" },
    "traceability":      { "result": "PASS", "rule": "dataset validation passed; every emitted check ID is in checks_map" },
    "failure_reporting": { "result": "PASS", "rule": "every SERVICE_FAILURE case listed with ID and failure_kind" }
  },
  "notes": ["CHK-SECRET: report and per-case stderr scanned for key value and AIza pattern: clean"]
}
```

`quality_gates` follows spec FR-40. Each `result` is `PASS`, `FAIL` or `NOT_EVALUATED`; `schema`,
`invariant` and `failure_reporting` are `NOT_EVALUATED` when no case ran (dataset invalid). The
section is reported information only and never changes `verdict`, `overall_score` or `exit_code`.

`summary.md` is the human-readable version: a verdict line, totals, service-failure IDs, a
quality-gates table, a per-case table (ID, category, guardrail, classification, L1, L2, task,
time, semantic, attempts, kind), and the failed check IDs.

## Secret handling

The report and the per-case data are serialised in memory first. They are then scanned for the
`GEMINI_API_KEY` value (if set) and `/AIza[0-9A-Za-z_-]{35}/`. A hit → `[REDACTED]`, the verdict
is forced to `ERROR`, and `notes` gets `secret_detected`. Raw stderr is not stored; only the
parsed `AGENT_DIAG` fields are. Before each case's stderr and raw stdout are discarded, the
runner scans them for the same two things (FR-24, FR-34). A hit adds the case ID (never the
matched text) to `stderr_secret_hits` (stderr) or `stdout_secret_hits` (stdout), forces the
verdict to `ERROR`, and adds `secret_detected: stderr <caseId>` or `secret_detected: stdout
<caseId>` to `notes`. Any hit makes `quality_gates.secrets` `FAIL`. Verdict `ERROR` on any
CHK-SECRET hit is spec FR-34 (since spec v1.4).
