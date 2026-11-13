# Evaluation summary — run-2026-11-13T07-13-00-363Z

**Verdict**: ERROR (exit code 2)

Reason: a case ended with configuration_error; no score is claimed

Spec 1.5 · dataset 1.0 · reference time 2026-11-12T10:00:00+05:30 (Asia/Kolkata) · model gemini-2.5-flash-lite

Totals: PASS 8 · FAIL 0 · SERVICE_FAILURE 0 · CONFIG_ERROR 17

Overall score: 0.32 (best case 0.32) · guardrail cases: 5/5 PASS

Service failures: none

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
| EV-01 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-02 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-03 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-04 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-05 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-06 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-07 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0.5 | 0 | 0.5 | 1 | — | — |
| EV-08 | normal | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-09 | boundary | ✘ | CONFIG_ERROR | ✔ | — | 0.5 | 0 | 0.5 | 1 | — | — |
| EV-10 | boundary | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0 | 0 | 1 | — | — |
| EV-11 | boundary | ✘ | CONFIG_ERROR | ✔ | — | 0.5 | 0 | 0.5 | 1 | — | — |
| EV-12 | boundary | ✘ | CONFIG_ERROR | ✔ | — | 0.5 | 0.5 | 1 | 1 | — | — |
| EV-13 | boundary | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0.5 | 0.5 | 1 | — | — |
| EV-14 | missing_info | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0.5 | 0.5 | 1 | — | — |
| EV-15 | missing_info | ✘ | CONFIG_ERROR | ✔ | — | 0.5 | 0.5 | 1 | 1 | — | — |
| EV-16 | ambiguous | ✘ | CONFIG_ERROR | ✔ | — | 0 | 0.5 | 0.5 | 1 | — | — |
| EV-17 | ambiguous | ✘ | CONFIG_ERROR | ✔ | — | 0.5 | 0.5 | 1 | 1 | — | — |
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
