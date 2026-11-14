// Pre-declared threshold, copied verbatim from spec FR-32 to FR-35 (declared 2026-11-12).

export const THRESHOLD = Object.freeze({ caseSemantic: 0.8, overall: 0.8, allGuardrailMustPass: true });

export function toDatasetForm() {
  return {
    case_semantic: THRESHOLD.caseSemantic,
    overall: THRESHOLD.overall,
    all_guardrail_cases_must_pass: THRESHOLD.allGuardrailMustPass,
  };
}
