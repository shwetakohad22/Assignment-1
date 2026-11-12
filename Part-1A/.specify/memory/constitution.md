<!--
Sync Impact Report
==================
Version change: (template, unversioned) → 1.0.0
Bump rationale: Initial ratification; all placeholders replaced with concrete governance.

Modified principles (placeholder → new title):
  - [PRINCIPLE_1_NAME] → I. Zero Lint Errors
  - [PRINCIPLE_2_NAME] → II. No Hardcoded Secrets
  - [PRINCIPLE_3_NAME] → III. Validated Input & Explicit Error Codes
  - [PRINCIPLE_4_NAME] → IV. Every Acceptance Criterion Is Tested (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. Quality Bar Integrity (NON-NEGOTIABLE)
  - (new)              → VI. Specification-First Change Control

Added sections:
  - Technology & Architecture Constraints (was [SECTION_2_NAME])
  - Development Workflow & Quality Gates (was [SECTION_3_NAME])
  - Governance (filled)

Removed sections: none

Dependent templates: not modified by this command (they read the constitution at runtime).

Follow-up TODOs: none. Ratification date set to first adoption date (2026-11-10).
-->

# Todo Task API Constitution

## Core Principles

### I. Zero Lint Errors

- Running ESLint across the entire project (`npx eslint .`) MUST report **0 errors**.
- An ESLint configuration file MUST be committed in the repository root, and every JavaScript
  source and test file MUST be inside its scope.
- Warnings SHOULD be fixed; any warning left in place MUST have a written justification in the
  code review.

**Measure**: ESLint exit code is `0` and its error count is `0`.

**Rationale**: A lint gate with a fixed threshold catches defects and style drift cheaply and
leaves no room for interpretation.

### II. No Hardcoded Secrets

- Source code, tests, fixtures, configuration files, and commit history MUST NOT contain
  hardcoded secrets: API keys, tokens, passwords, private keys, or credential-bearing URLs.
- Any configurable or sensitive value (for example port number or data-file path) MUST be read
  from environment variables (`process.env`) and given a safe, non-secret default.
- If a `.env` file is used it MUST be listed in `.gitignore`; a `.env.example` containing only
  placeholder values MAY be committed.

**Measure**: A secret scan of the repository (manual review plus a pattern search for
key/token/password/secret assignments) finds **0** hardcoded secrets.

**Rationale**: Secrets in source get leaked through clones, logs, and history and cannot be
reliably revoked after the fact.

### III. Validated Input & Explicit Error Codes

- Every endpoint MUST validate all inputs (path parameters, query parameters, and JSON body:
  presence, type, allowed values, and length limits) before reading or writing the data store.
- Malformed JSON, missing required fields, wrong types, or out-of-range values MUST return
  **HTTP 400 Bad Request**.
- A request that targets a task ID which does not exist MUST return **HTTP 404 Not Found**.
- A status change that is not allowed by the task lifecycle defined in the specification MUST
  return **HTTP 409 Conflict**.
- Every error response MUST be JSON with a stable machine-readable `error` code and a
  human-readable `message`; it MUST NOT expose stack traces or internal file paths.
- A request that fails validation MUST NOT modify the JSON data file.

**Measure**: For every endpoint there is at least one automated test per applicable error
class (400 / 404 / 409) that asserts both the status code and the error body.

**Rationale**: Predictable, documented errors make the API safe for clients to use and keep
invalid data out of the store.

### IV. Every Acceptance Criterion Is Tested (NON-NEGOTIABLE)

- Every acceptance criterion in the feature specification MUST map to at least one automated
  test.
- Tests MUST use only the built-in Node.js test runner (`node:test`, `node:assert`) and MUST be
  run with `node --test`.
- Each test MUST reference the acceptance criterion it covers (for example by its ID in the test
  name or a comment) so coverage can be traced in both directions.
- Tests MUST use an isolated, temporary data file and MUST NOT read or modify the real data file.

**Measure**: `node --test` exits with code `0`, and the traceability check shows **100%** of
acceptance criteria covered by at least one test.

**Rationale**: Acceptance criteria are only meaningful if they are continuously and
automatically verified.

### V. Quality Bar Integrity (NON-NEGOTIABLE)

To get a passing result, the coding agent (and any human contributor) MUST NOT:

- delete, skip (`skip`, `todo`, `only`), or comment out tests;
- weaken assertions (for example replacing a strict equality with a looser check, removing
  assertions, or changing expected values to match wrong output);
- lower any threshold or quality bar defined in this constitution;
- disable, suppress, or reconfigure lint or security checks (including `eslint-disable`
  comments, rule removal, or excluding files from scanning).

A test or check MAY be changed only when the specification itself changed (see Principle VI),
and the change MUST cite the specification amendment. When a check fails, the fix MUST be made
in the implementation, or the conflict MUST be reported to a human.

**Measure**: Code review of every change finds **0** removed tests, skipped tests, weakened
assertions, or newly disabled checks without a matching recorded specification change.

**Rationale**: A green build is only evidence of quality if the gates themselves cannot be
quietly lowered.

### VI. Specification-First Change Control

- Any change to requirements (new behaviour, changed behaviour, or removed behaviour) MUST be
  made in the feature specification **before** any code or test is changed.
- Every specification change MUST be recorded in a dated changelog/revision entry in the
  specification that states what changed, why, and which acceptance criteria were affected.
- Tests and implementation MUST then be updated to match the amended specification.

**Measure**: Every behaviour change in code can be traced to a recorded specification revision
that is dated on or before the code change.

**Rationale**: The specification is the single source of truth; changing code first creates
silent drift between what is promised and what is built.

## Technology & Architecture Constraints

- **Runtime**: Node.js (current LTS). Production code MUST use **only built-in Node.js modules**
  (for example `node:http`, `node:fs`, `node:path`, `node:crypto`, `node:url`). No web
  frameworks (such as Express, Fastify, Koa) and no runtime npm dependencies.
- **Development dependencies**: Limited to tooling that does not ship at runtime; ESLint is the
  only expected development dependency.
- **Persistence**: Tasks are stored in a single JSON file. Writes MUST be atomic (write to a
  temporary file, then rename) so a crash cannot leave a corrupted file. A missing data file
  MUST be treated as an empty task list.
- **API style**: JSON request and response bodies with the `Content-Type: application/json`
  header; resource-oriented routes under a task resource (for example `/tasks` and
  `/tasks/:id`).
- **Simplicity**: Keep the codebase small and readable; avoid abstractions that are not
  required by the specification (YAGNI).

## Development Workflow & Quality Gates

A change is complete only when **all** of the following gates pass:

1. **Spec gate**: Requirement changes are recorded in the specification first (Principle VI).
2. **Lint gate**: `npx eslint .` reports 0 errors (Principle I).
3. **Secret gate**: No hardcoded secrets are found (Principle II).
4. **Test gate**: `node --test` passes and every acceptance criterion is covered (Principle IV),
   including the error-code tests required by Principle III.
5. **Integrity gate**: The review confirms no tests were deleted or skipped, no assertions were
   weakened, and no checks were disabled (Principle V).

If a gate cannot be passed without violating a principle, work MUST stop and the issue MUST be
escalated to a human instead of being worked around.

## Governance

- This constitution supersedes all other project practices. When a plan, task list, or
  implementation conflicts with it, the constitution wins.
- **Amendments** MUST be made by editing this file, MUST include a Sync Impact Report describing
  the change, and MUST update the version and Last Amended date.
- **Versioning** follows semantic versioning:
  - MAJOR: a principle is removed or redefined in a backward-incompatible way;
  - MINOR: a new principle or section is added, or guidance is materially expanded;
  - PATCH: clarifications, wording, or typo fixes with no change in meaning.
- **Compliance review**: Every change MUST be checked against all six principles and the
  quality gates before it is accepted. Any exception MUST be written down with its justification
  and approved by a human; the coding agent MUST NOT grant itself an exception.

**Version**: 1.0.0 | **Ratified**: 2026-11-10 | **Last Amended**: 2026-11-10
