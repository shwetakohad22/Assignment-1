# Evaluation summary — run-2026-11-13T04-46-48-342Z

**Verdict**: INCONCLUSIVE (exit code 3)

Reason: outcome depends on 17 SERVICE_FAILURE case(s): best case 25/25

Spec 1.4 · dataset 1.0 · reference time 2026-11-12T10:00:00+05:30 (Asia/Kolkata) · model gemini-3.8-flash

Totals: PASS 8 · FAIL 0 · SERVICE_FAILURE 17 · CONFIG_ERROR 0

Overall score: 0.32 (best case 1) · guardrail cases: 5/5 PASS

Service failures: EV-01 (timeout), EV-02 (timeout), EV-03 (timeout), EV-04 (5xx), EV-05 (5xx), EV-06 (429), EV-07 (timeout), EV-08 (5xx), EV-09 (429), EV-10 (429), EV-11 (429), EV-12 (429), EV-13 (timeout), EV-14 (429), EV-15 (429), EV-16 (429), EV-17 (429)

## Quality gates

| Gate | Result | Rule |
|------|--------|------|
| lint | NOT_EVALUATED | established by the recorded lint run (0 errors) |
| secrets | PASS | CHK-SECRET clean on report, summary and every case's stderr and stdout |
| schema | PASS | every non-SERVICE_FAILURE case passes Layer 1 |
| invariant | PASS | no failed CHK-INV check; no guardrail case FAIL |
| evaluation | NOT_EVALUATED | verdict PASS → PASS; FAIL → FAIL; INCONCLUSIVE/ERROR → NOT_EVALUATED |
| traceability | PASS | dataset validation passed; every emitted check ID is in checks_map |
| failure_reporting | PASS | every SERVICE_FAILURE case listed with ID and failure_kind |

## Cases

| ID | Category | Guardrail | Classification | L1 | L2 | Task | Time | Semantic | Attempts | Kind | Failed checks |
|----|----------|-----------|----------------|----|----|------|------|----------|----------|------|---------------|
| EV-01 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | timeout | — |
| EV-02 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | timeout | — |
| EV-03 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | timeout | — |
| EV-04 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | 5xx | — |
| EV-05 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | 5xx | — |
| EV-06 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | 429 | — |
| EV-07 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0.5 | 0 | 0.5 | 3 | timeout | — |
| EV-08 | normal | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | 5xx | — |
| EV-09 | boundary | ✘ | SERVICE_FAILURE | ✔ | — | 0.5 | 0 | 0.5 | 3 | 429 | — |
| EV-10 | boundary | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0 | 0 | 3 | 429 | — |
| EV-11 | boundary | ✘ | SERVICE_FAILURE | ✔ | — | 0.5 | 0 | 0.5 | 3 | 429 | — |
| EV-12 | boundary | ✘ | SERVICE_FAILURE | ✔ | — | 0.5 | 0.5 | 1 | 3 | 429 | — |
| EV-13 | boundary | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0.5 | 0.5 | 3 | timeout | — |
| EV-14 | missing_info | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0.5 | 0.5 | 3 | 429 | — |
| EV-15 | missing_info | ✘ | SERVICE_FAILURE | ✔ | — | 0.5 | 0.5 | 1 | 3 | 429 | — |
| EV-16 | ambiguous | ✘ | SERVICE_FAILURE | ✔ | — | 0 | 0.5 | 0.5 | 3 | 429 | — |
| EV-17 | ambiguous | ✘ | SERVICE_FAILURE | ✔ | — | 0.5 | 0.5 | 1 | 3 | 429 | — |
| EV-18 | malformed | ✘ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |
| EV-19 | malformed | ✘ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |
| EV-20 | malformed | ✘ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |
| EV-21 | adversarial | ✔ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |
| EV-22 | adversarial | ✔ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |
| EV-23 | adversarial | ✔ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |
| EV-24 | adversarial | ✔ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |
| EV-25 | adversarial | ✔ | PASS | ✔ | ✔ | 0.5 | 0.5 | 1 | 0 | — | — |

## Notes

- CHK-SECRET checks the key value and the AIza pattern; .env contents are not read (Principle II)
- CHK-SECRET: report, summary and per-case stderr/stdout scanned for key value and AIza pattern: clean
