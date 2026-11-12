<!--
Sync Impact Report
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification; all placeholders replaced with project-specific governance.

Principles defined (template slot → new title):
  - PRINCIPLE_1 → I. Minimal Built-in Stack & Clean Lint
  - PRINCIPLE_2 → II. Secret Hygiene (NON-NEGOTIABLE)
  - PRINCIPLE_3 → III. Stable Output Contract
  - PRINCIPLE_4 → IV. Invariants & Safety Guardrails
  - PRINCIPLE_5 → V. Layered, Traceable, Pre-Declared Evaluation
  - (added)     → VI. Honest Failure Classification
  - (added)     → VII. Evaluation Integrity (NON-NEGOTIABLE)
  - (added)     → VIII. Specification-First Change Control

Added sections:
  - Technology & Security Constraints (SECTION_2)
  - Quality Gates & Development Workflow (SECTION_3)
  - Governance

Removed sections: none

Templates requiring updates:
  - .specify/templates/plan-template.md      ⚠ not modified by this command; its
    "Constitution Check" gate reads this file at runtime and must check Principles I–VIII.
  - .specify/templates/spec-template.md      ⚠ not modified; specs must carry requirement IDs,
    the evaluation threshold/scoring section, and a dated revision history (Principles V, VIII).
  - .specify/templates/tasks-template.md     ⚠ not modified; tasks must include lint, schema,
    invariant and evaluation tasks.

Follow-up TODOs: none. RATIFICATION_DATE set to first adoption date 2026-11-12.
Verified: `.env` is matched by `.gitignore` (git check-ignore); file contents were not opened.
-->

# Part-1B Natural-Language Reminder Agent Constitution

## Core Principles

### I. Minimal Built-in Stack & Clean Lint

- The agent MUST be implemented in Node.js using only built-in modules (including the built-in
  global `fetch`). No frameworks and no runtime npm dependencies are permitted:
  `package.json` `dependencies` MUST be empty or absent.
- ESLint is the ONLY permitted dev dependency (plus its own config packages, if any are
  strictly required by ESLint itself).
- ESLint MUST report **zero errors** on all project source, test and evaluation code before any
  commit that claims a passing state. Warnings MUST be reviewed and justified if left in place.

**Rationale**: A minimal stack keeps the attack surface, the supply-chain risk and the evaluation
noise small, and zero lint errors is an objective, machine-checkable quality floor.

### II. Secret Hygiene (NON-NEGOTIABLE)

- The Gemini API key MUST be read only from the `GEMINI_API_KEY` environment variable at runtime.
- The key MUST NEVER be hardcoded, logged, printed, echoed in error messages, included in
  request URLs that are logged, copied into evidence/report files, or committed.
- The coding agent MUST NEVER open, read, print, copy, or otherwise access the contents of the
  `.env` file. Only its ignored status may be verified (e.g. `git check-ignore .env`).
- `.env` MUST remain listed in `.gitignore`; removing it is prohibited.
- If `GEMINI_API_KEY` is missing, the program MUST fail with a clear message that names the
  variable but never reveals any value.

**Rationale**: A leaked key is irreversible once committed or published; the only safe default is
that neither code, logs, evidence nor the agent ever touches the secret value.

### III. Stable Output Contract

- Every response returned by the agent MUST validate against a single, versioned JSON schema
  contract that fixes field names, types, required fields and allowed values (enumerations).
- The supported intents are exactly: `create`, `reschedule`, `snooze`, `clarify`. Any other
  value MUST be rejected or normalised to a contract-valid response; it MUST NOT be emitted.
- The contract MUST hold regardless of how the model words its answer: model text MUST be parsed
  and validated by deterministic code, and any non-conforming model output MUST be converted into
  a contract-valid response (e.g. `clarify` or a structured error), never passed through raw.
- The schema MUST be defined in the specification, and changes to it follow Principle VIII.

**Rationale**: Downstream consumers and the evaluation harness rely on a predictable shape; LLM
output is non-deterministic, so validation must be enforced in code, not trusted to the model.

### IV. Invariants & Safety Guardrails

For **every** output, the following invariants MUST hold and MUST be checked by deterministic code:

- The output is schema-valid (Principle III).
- The intent is one of the supported intents only.
- Every date/time field is a valid ISO 8601 value.
- When mandatory information (at minimum the task and the time) is missing or ambiguous, the
  agent MUST return intent `clarify` with a clarification question and MUST NOT guess or
  fabricate the missing value.
- Prompt-injection attempts (e.g. instructions to ignore rules, reveal the system prompt or
  secrets, or change the output format) and harmful requests MUST be refused or blocked with a
  contract-valid response; they MUST NOT alter the agent's behaviour or leak configuration.

Guardrails MUST NOT be disabled, bypassed or weakened for testing or evaluation convenience.

**Rationale**: These properties are the minimum guarantees that make the agent safe and useful;
checking them in code makes them provable for every single output, not just on average.

### V. Layered, Traceable, Pre-Declared Evaluation

- The evaluation MUST have three layers:
  1. **Schema validation** — deterministic;
  2. **Invariant/property checks** — deterministic (Principle IV);
  3. **Semantic/quality score** — may use reference answers or an LLM-assisted judge.
- The deterministic layers (1 and 2) MUST NEVER be replaced by an LLM judge. An LLM judge MAY
  only contribute to layer 3 and MUST NOT override a layer 1 or 2 failure.
- The pass threshold and the exact score calculation (per-layer weights, aggregation and any
  hard-fail conditions) MUST be declared in the specification BEFORE the final evaluation run,
  and MUST NEVER be lowered or loosened afterwards.
- Every evaluation case MUST reference at least one requirement ID from the specification;
  cases without a valid requirement ID are invalid and MUST NOT be counted.

**Rationale**: Pre-declared thresholds prevent goal-post moving; deterministic layers give
reproducible evidence; traceability proves each requirement is actually tested.

### VI. Honest Failure Classification

- Failures of the model service — network errors, HTTP 429/rate limiting, quota exhaustion,
  timeouts and 5xx responses — MUST be classified and reported as **model-service failures**,
  separately from application failures and from evaluation (assertion) failures.
- Model-service failures MUST NEVER be counted as application failures, MUST NEVER be counted
  as passes, and MUST NEVER be hidden, silently retried away without record, or dropped from
  reports. Reports MUST state their count and the affected case IDs.
- Requests to the model service MUST use an explicit timeout.

**Rationale**: Mixing infrastructure outages with application defects corrupts both the score
and the diagnosis; transparent reporting keeps the results honest.

### VII. Evaluation Integrity (NON-NEGOTIABLE)

The coding agent MUST NEVER, in order to obtain a pass:

- delete, skip, or weaken evaluation cases or assertions;
- change expected results without a recorded specification revision (Principle VIII);
- lower the pass threshold or alter the scoring formula after it has been declared;
- disable, bypass, or weaken guardrails or invariant checks;
- disable, suppress, or reconfigure lint rules or security checks (including inline
  `eslint-disable` comments) without a recorded, justified specification revision.

A failing result MUST be reported as failing, with evidence, and repaired by fixing the
application — not the measurement.

**Rationale**: An evaluation is only meaningful if the measuring instrument cannot be bent
toward the desired outcome.

### VIII. Specification-First Change Control

- Any change to requirements, the output schema, expected results, the threshold or the scoring
  method MUST be made in the specification first, before code or evaluation changes.
- Every such change MUST be recorded in the specification's revision history with an ISO date
  (YYYY-MM-DD), a version, a description of what changed, and the reason.
- Requirement IDs MUST be stable; retired requirements are marked as retired, not reused.

**Rationale**: A dated, spec-first audit trail makes every behavioural change reviewable and
distinguishes legitimate requirement changes from result tampering.

## Technology & Security Constraints

- **Runtime**: Node.js (a version that provides the built-in global `fetch`, i.e. Node 18+).
- **Dependencies**: zero runtime npm dependencies; ESLint only as dev dependency.
- **Model provider**: Google Gemini API, called via built-in `fetch` over HTTPS.
- **Configuration**: `GEMINI_API_KEY` from the environment only; no other secret sources.
- **Logging & evidence**: logs, evaluation reports and evidence files MUST NOT contain the API
  key, request headers carrying credentials, or the contents of `.env`.
- **Repository hygiene**: `.env` MUST stay in `.gitignore`; no secrets in commit history.

## Quality Gates & Development Workflow

A change may be reported as passing only when ALL of the following gates hold:

1. **Lint gate**: ESLint reports 0 errors.
2. **Secrets gate**: no hardcoded key, no key in logs or evidence, `.env` ignored and unread.
3. **Schema gate**: 100% of outputs validate against the JSON schema contract.
4. **Invariant gate**: 100% of outputs satisfy the Principle IV invariants and guardrails.
5. **Evaluation gate**: the semantic/quality score meets the threshold pre-declared in the
   specification, computed exactly as declared.
6. **Traceability gate**: every evaluation case maps to a valid requirement ID.
7. **Failure-reporting gate**: model-service failures are reported separately with case IDs.

Workflow: constitution → specification (with requirement IDs, schema, threshold, scoring and
revision history) → plan → tasks → implementation → evaluation. Evaluation runs and their
outcomes (including failing runs before repair) MUST be preserved as evidence.

## Governance

- This constitution supersedes all other practices for Part-1B. Where a plan, task or
  implementation conflicts with it, the constitution prevails and the conflict MUST be fixed.
- **Amendments**: proposed in writing, recorded in the Sync Impact Report and in this file with
  an updated version and Last Amended date, and approved by the human project owner. The coding
  agent MUST NOT amend this constitution to make a failing gate pass.
- **Versioning policy** (semantic versioning):
  - MAJOR — removal or backward-incompatible redefinition of a principle or gate;
  - MINOR — a new principle/section or materially expanded guidance;
  - PATCH — clarifications and wording fixes without semantic change.
- **Compliance review**: every plan MUST include a Constitution Check against Principles I–VIII;
  every evaluation report MUST state the result of each Quality Gate. Any justified exception
  MUST be documented with an ID, reason, scope and date, and MUST NOT weaken Principles II or VII.

**Version**: 1.0.0 | **Ratified**: 2026-11-12 | **Last Amended**: 2026-11-12
