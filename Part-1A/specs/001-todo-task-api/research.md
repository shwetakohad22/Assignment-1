# Research: Todo Task REST API

**Feature**: `001-todo-task-api` | **Date**: 2026-11-10 | **Plan**: [plan.md](plan.md)

The Technical Context had no open `NEEDS CLARIFICATION` items. The user input and the constitution
fixed the main choices (built-in modules only, `node:test`, ESLint, `src/` + `tests/`, env-based
config, atomic writes, saves one at a time). This file records the smaller design decisions behind
those choices and the risks each one handles.

---

## R1. Runtime version and module format

- **Decision**: Node.js 24 LTS (installed: v24.15.0), with `"engines": { "node": ">=22" }`. ES
  modules (`"type": "module"`), and every built-in imported with the `node:` prefix.
- **Rationale**: Node 22 and 24 are the current LTS lines. Both have stable `node:test`,
  `crypto.randomUUID()`, `import.meta.dirname`, and stable `Array.prototype.sort` (needed for
  AC-42 and AC-44). ESM matches ESLint's flat-config defaults.
- **Alternatives considered**: CommonJS works too but needs extra ESLint `sourceType` setup.
  Node 18 is past end-of-life.

## R2. Allowed modules

- **Decision**: Production code imports only `node:http`, `node:fs` (`node:fs/promises`),
  `node:path`, and `node:crypto`. Query strings are parsed with the global `URL` class, which needs
  no import. Test code may also use `node:test`, `node:assert/strict`, `node:os` (temp folders),
  and `node:child_process` (to start the real process for restart tests).
- **Rationale**: Matches the user's module list and the constitution's "built-in modules only"
  rule. `URL` and `URLSearchParams` are globals, so `node:url` is not needed.
- **Alternatives considered**: `node:url` / `querystring`: not needed. Express or Fastify: banned
  by the constitution.

## R3. ESLint setup with ESLint as the only dev dependency

- **Decision**: `devDependencies` contains only `eslint` (v9, flat config). `eslint.config.js` at
  the repo root uses `@eslint/js` `recommended`. That package is a dependency of `eslint` itself,
  so it is installed with it and is not listed separately. Node globals (`process`, `console`,
  `Buffer`, `URL`, `setTimeout`, `clearTimeout`) are declared by hand in `languageOptions.globals`,
  so the `globals` package is not needed. The config covers `src/**/*.js`, `tests/**/*.js`, and
  `eslint.config.js`, and ignores only `node_modules/`.
- **Rationale**: Keeps the "ESLint is the only dev dependency" rule and the constitution's rule
  that every JS file is linted.
- **Risk / fallback**: Importing `@eslint/js` relies on npm placing it at the top level of
  `node_modules`, which is npm's default. If a package manager does not do that, the fix is to add
  `@eslint/js` (an official ESLint package) to `devDependencies`. A human must approve that change,
  because it goes against the "one dev dependency" input.
- **Alternatives considered**: Listing rules by hand is long and easy to get wrong. Importing
  `builtinRules` from `eslint/use-at-your-own-risk` depends on an unstable API.

## R4. Configuration (environment variables)

- **Decision**: `src/config.js` reads:

  | Variable | Default | Validation |
  |----------|---------|------------|
  | `PORT` | `3000` | Integer 0–65535 (0 = any free port, used by tests) |
  | `DATA_FILE` | `<repo>/data/tasks.json` (resolved from `import.meta.dirname`, so it does not depend on the current directory) | Non-empty string, turned into an absolute path |
  | `HOST` | `127.0.0.1` | Non-empty string |

  An invalid value makes startup fail with exit code 1 and a clear message. *(Rev 1.3: this is now
  required by FR-023 and tested by AC-62 and `tests/config.unit.test.js`.)*
- **Rationale**: Covers FR-023 and constitution Principle II. These values are not secret.
  Listening on loopback by default is the safe choice for an API with no authentication (spec
  Assumptions: single user, local).
- **Alternatives considered**: CLI flags (the constitution names env vars). A `.env` loader would
  need a dependency or extra code. Node 22+ has `--env-file`, which users can use without any code
  change.

## R5. Atomic save (temporary file, then rename)

- **Decision**: `saveTasks(file, tasks)`:
  1. `mkdir(dirname(file), { recursive: true })`.
  2. Temp path in the **same directory**: `${file}.${process.pid}.${randomUUID()}.tmp`, so the
     rename stays on the same volume and is atomic.
  3. Open with flag `wx` (fail if the file exists), write `JSON.stringify(tasks, null, 2) + "\n"`,
     call `filehandle.sync()` (fsync), then close.
  4. `rename(tmp, file)`. On Windows, if it fails with `EPERM`, `EBUSY`, or `EACCES` (usually
     antivirus or the search indexer holding the file briefly), retry up to 5 times with short
     increasing waits (10, 20, 40, 80, 160 ms), then give up.
  5. On any failure, delete the temp file (best effort) and re-throw.
- **Rationale**: Meets the constitution's persistence rule. A crash at any step leaves the old
  file or the new file whole, never half of each. The fsync makes sure the data is on disk before
  the rename makes it visible. The Windows retry handles a known `fs.rename` problem on the
  developer's OS (win32).
- **Alternatives considered**: `writeFile` directly onto the data file is not atomic. Write-ahead
  or append logs are more than the spec needs.

## R6. Saves happen one at a time (FR-025, AC-54)

- **Decision**: `src/store.js` keeps a promise-chain mutex:

  ```text
  let tail = Promise.resolve();
  function exclusive(fn) { const run = tail.then(fn); tail = run.catch(() => {}); return run; }
  ```

  Every change (create, update, delete) runs as **one** step inside `exclusive`:
  read the current list → check existence, fields, and transition → build a **new** array (old task
  objects are not changed; changed tasks are new objects) → `await saveTasks(file, next)` → only
  then set `this.tasks = next` → return the result. Read requests (`GET`) do not take the lock.
  They read the last committed array, which always matches what is on disk.
- **Rationale**:
  - All 20 simultaneous POSTs in AC-54 are queued. Each one builds on the list left by the one
    before, so none is overwritten, and each one's file write finishes before the next starts. Two
    `rename`s never race.
  - Because the existence check and the transition check run **inside** the lock, two PATCH
    requests to the same task cannot both pass against an old status.
  - Memory is updated only after the save succeeds, so a failed save leaves memory and file the
    same (FR-016 all-or-nothing). A client gets 201/200/204 only after its change is on disk
    (FR-021).
  - The lock releases even if a step throws (`run.catch`), so one failure does not block the queue.
- **Alternatives considered**: Grouping several changes into one write is faster under load but
  adds complexity that SC-005 (≤1,000 tasks, <1 s) does not need. A lock file between processes is
  out of scope (spec Assumptions: one process). Sync `writeFileSync` would block the event loop and
  still needs the temp-file step.

## R7. Request body size limit and check order (FR-019, FR-024, AC-52, AC-53)

- **Decision**: `readBody(req, limit = 102400)` counts bytes as they arrive. If the total goes
  over the limit, it stops keeping data but **keeps reading to the end** (it does not destroy the
  socket), then rejects with `VALIDATION_ERROR`. JSON parsing happens only after a body within the
  limit is fully read. The handler order is:
  1. Route and method match → else 404 `ROUTE_NOT_FOUND` (no body read needed).
  1a. *(Rev 1.3)* Query parameter on a route other than `GET /tasks` → 400 `VALIDATION_ERROR`
      (FR-026, R10); `{id}` not valid percent-encoding, or longer than 100 characters after
      decoding (rev 1.4) → 400 `VALIDATION_ERROR` (FR-027, R15).
      Both run before the body is read.
  2. Body too large → 400 `VALIDATION_ERROR`.
  3. `JSON.parse` fails (including an empty body) → 400 `INVALID_JSON`.
  4. *(inside the lock)* Task ID not found → 404 `TASK_NOT_FOUND`.
  5. Body is not a plain object / field validation → 400 `VALIDATION_ERROR`.
  6. Status transition → 409 `INVALID_STATUS_TRANSITION`.
- **Rationale**: Draining instead of destroying the request avoids `ECONNRESET` on the client
  before it reads the 400, which happens often on Windows. The body is at most a few hundred KB in
  practice, so draining is cheap. Steps 2–3 run before the lock, so bad requests never wait in the
  queue. Step 5 includes "body is `null` or an array", so the order in AC-53 holds for every kind
  of invalid body.
- **Alternatives considered**: Checking only `Content-Length` misses chunked bodies, so the
  streamed count is the real check. Destroying the socket is faster but makes AC-52 flaky.

## R8. ID generation and creation order

- **Decision**: `id = crypto.randomUUID()`. Creation order is the **array order** in memory and in
  the file (new tasks are appended inside the lock). `createdAt = new Date().toISOString()`.
- **Rationale**: UUID v4 makes duplicate IDs practically impossible (AC-03, AC-54). Several tasks
  can share the same millisecond `createdAt` (very likely in AC-54), so sorting by timestamp could
  give the wrong order. Insertion order is exact, survives a restart because the array order is
  saved, and gives the "ties keep creation order" rule (FR-014) through a stable sort.

## R9. Text length counting

- **Decision**: Title and tag lengths are counted in **Unicode code points**
  (`[...str].length`) after `trim()`.
- **Rationale**: "Characters" in FR-004 and FR-007 means what a user sees, so an emoji counts as 1,
  not 2 UTF-16 units. The ACs use ASCII, so this choice does not change their results.

## R10. Query parameter rules for `GET /tasks`

- **Decision**: Only `tag` and `sort` are accepted. Each may appear at most once. An unknown
  parameter, a repeated parameter, a `tag` that is empty after trimming, or a `sort` other than
  `priority` → 400 `VALIDATION_ERROR`. ~~Query strings on other routes are ignored.~~
  *(Superseded by spec rev 1.3, 2026-11-10.)* Any query parameter on a route other than
  `GET /tasks` → 400 `VALIDATION_ERROR` (FR-026, AC-55), checked right after the route match and
  before the body is read. A `tag` longer than 50 code points after trimming → 400 (FR-013,
  AC-61), the same limit as stored tags. Unknown and repeated keys are now spec rules (FR-013,
  AC-58).
- **Rationale**: Matches FR-017 ("bad query parameter") and treats query strings as strictly as
  bodies, where unknown fields are rejected. One tag at a time follows the spec Assumptions.
  Rev 1.3: ignoring query strings on other routes did not meet constitution Principle III
  ("every endpoint MUST validate all inputs ... query parameters"), found by `/speckit-analyze`
  (finding C1). Principle III also asks for length limits, hence the 50-character tag limit (U2).

## R11. Startup loading of the data file (FR-022, AC-47, AC-49)

- **Decision**: `loadTasks(file)`:
  - `ENOENT` → `[]`. The file is **not** created until the first successful change.
  - Otherwise read it, `JSON.parse` it, and check: the top level is an array; each item has exactly
    the six fields with valid values (same rules as the API, plus `createdAt` is an ISO UTC
    string); IDs are unique. Any failure, including an empty file, throws a `DataFileError`.
  - `src/index.js` catches it, writes `Failed to start: <reason>` to stderr, sets exit code 1, and
    never writes the file.
- **Rationale**: Refusing to start is safer than quietly starting empty and then overwriting the
  user's data at the next save.

## R12. Errors outside the spec's error table

- **Decision**: An unexpected error (for example a disk write failure after all retries) returns
  **500** `{ "error": "INTERNAL_ERROR", "message": "Internal server error" }`. The details go to
  stderr only. Stored data does not change (R6).
- **Rationale**: FR-018 forbids stack traces or paths in responses. A process that crashes on a
  disk error would lose any requests waiting in the queue.
- **Spec follow-up**: Done. Spec revision 1.2 (2026-11-10) added this row to FR-017 before
  implementation, as constitution Principle VI requires. No AC changed.
- **Rev 1.3 follow-up**: AC-57 now tests this path. The test makes the save fail without mocks:
  `DATA_FILE` points to `<tmp>/blocked/tasks.json`, and after startup a regular **file** named
  `<tmp>/blocked` is created, so `mkdir(dirname(file), { recursive: true })` fails on every OS.
  The test then removes that file and checks that a later create succeeds (the lock is not stuck).

## R13. Content type, 204, and unsupported methods

- **Decision**: All JSON responses send exactly `Content-Type: application/json` (no `charset`
  parameter; RFC 8259 defines JSON as UTF-8) and a `Content-Length`. 204 sends no body and no
  `Content-Type`. Any method/path pair outside the five routes (including `PUT`, `HEAD`,
  `OPTIONS`, and `/tasks/`) → 404 `ROUTE_NOT_FOUND`. Request `Content-Type` is not checked (the
  spec does not require it).
- **Rationale**: Lets AC-51 compare the header with a plain equality check (constitution
  Principle V: no weakened assertions).
- **Rev 1.3**: The 404 for `HEAD`, `OPTIONS`, and `/tasks/`, and `INVALID_JSON` for an empty body
  (R7 step 3), are now spec rules (FR-017, AC-59, AC-60). A `HEAD` reply has no body by HTTP
  rules, so AC-60 checks only its status.

## R14. Test strategy

- **Decision**:
  - **In-process tests** (most ACs): `tests/helpers/server.js` exports `startServer()`. It makes a
    temp folder (`fs.mkdtemp(os.tmpdir())`), builds the app with `DATA_FILE` set to a file in that
    folder and port `0`, and returns `{ baseUrl, dataFile, close }`. Requests use the global
    `fetch`.
  - **Process tests** (AC-45, AC-46, AC-47, AC-49, and the restart part of AC-54): start
    `node src/index.js` with `node:child_process`, `PORT=0`, and a temp `DATA_FILE`. Wait for the
    stdout line `Listening on http://<host>:<port>` to get the real port. Stop it with
    `child.kill()` after all responses have arrived.
  - **Raw-byte tests** (AC-48): read the data file with `fs.readFile` (Buffer) before and after
    each rejected request and compare with `assert.deepStrictEqual`.
  - **Size tests** (AC-52): send `'a'.repeat(102401)`. It is invalid JSON on purpose, to show the
    size check runs first.
  - Each test name starts with its AC ID (for example `test('AC-31: todo → done is rejected', …)`),
    so coverage can be traced both ways (constitution Principle IV).
- **Rationale**: Process tests check real restarts and real exit codes. In-process tests keep the
  suite fast. `child.kill()` on Windows ends the process without running signal handlers, which is
  safe because every reply is sent only after its save finished (R6).
- **Alternatives considered**: An HTTP client library would break the no-dependency rule.
  Supertest-style injection is not built in.
- **Rev 1.3**: Every AC test asserts responses only through the shared helpers
  `assertJsonResponse` / `assertError`, so AC-51 (content type and error shape) is checked on every
  response, not on a sample (finding G2). `HEAD` responses (AC-60) are the only exception: status
  only, because they have no body. AC-62 is a process test (`runProcessToExit` with `PORT=abc`).
- **Rev 1.4**: AC-51 now covers AC-04 – AC-63 (finding N4). The helper rule above already
  enforces it on every response; no test strategy change.

## R15. Decoding the task ID from the URL (FR-027, AC-56) — added for spec rev 1.3

- **Decision**: The `{id}` segment is decoded with `decodeURIComponent` inside a try/catch. A
  `URIError` (for example `/tasks/%E0%A4`) → 400 `VALIDATION_ERROR` with message
  `Task id is not valid URL encoding`. This runs right after the route match, before the body is
  read.
- **Rationale**: Without the try/catch, the `URIError` reaches the generic error branch and the
  client gets 500 `INTERNAL_ERROR`. FR-017 says 500 is only for failures no client input can cause,
  and constitution Principle III says malformed input gets 400. Found by `/speckit-analyze`
  (finding C2).
- **Alternatives considered**: 404 `TASK_NOT_FOUND` (no task can have that ID) hides that the
  request itself is malformed; 400 matches Principle III.
- **Rev 1.4 (2026-11-10), ID length (FR-027, AC-63)**: After decoding, the ID must be 1–100
  code points (counted as in R9); a longer ID → 400 `VALIDATION_ERROR` with message
  `Task id must be at most 100 characters`, checked right after decoding and before any store
  call. An empty ID cannot reach this check, because `^/tasks/([^/]+)$` needs at least one
  character (`/tasks/` is a 404 route miss, AC-60).
  - **Rationale**: Constitution Principle III asks for length limits on every input, path
    parameters included (finding N5). Real IDs are 36-character UUIDs, so 100 leaves room.
    Every ID used in existing ACs (`does-not-exist`, UUIDs) is shorter, so no existing result
    changes.
  - **Alternatives considered**: Requiring the exact UUID format would turn `does-not-exist` in
    AC-19, AC-26, AC-37 and AC-53 into 400 instead of 404, which changes existing ACs, so it was
    rejected. Recording a human-approved exception would leave the gap open.
