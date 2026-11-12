# Implementation Plan: Todo Task REST API

**Branch**: `001-todo-task-api` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-todo-task-api/spec.md` (v1.4; plan updated
in place on 2026-11-10 for rev 1.3 and rev 1.4, see "Revision 1.3 updates" and "Revision 1.4
updates" below)

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build a small REST API for tasks (create, list, get, update, delete). It has a strict status
lifecycle, a case-insensitive tag filter, and a stable priority sort, and it stores all tasks in
one JSON file. It uses **only built-in Node.js modules** (`node:http`, `node:fs`, `node:path`,
`node:crypto`) and no framework. Requests go through a small hand-written router. Pure validation
functions check each request before any data changes. A store module saves the whole list to disk
**atomically** (write a temp file, fsync, rename) and runs every change **one at a time**
through a promise-chain lock, so 20 simultaneous creates are all kept (AC-54). Tests use
`node:test`, run with `node --test`, and name the AC each one covers. ESLint is the only dev
dependency.

## Technical Context

**Language/Version**: JavaScript (ES modules) on Node.js 24 LTS (`engines: >=22`)

**Primary Dependencies**: None at runtime. Built-ins: `node:http`, `node:fs`, `node:path`,
`node:crypto`. Dev: `eslint` (v9 flat config) only.

**Storage**: One JSON file (`DATA_FILE`, default `data/tasks.json`). Atomic temp-file + rename
writes, one save at a time.

**Testing**: `node:test` + `node:assert/strict`, run with `node --test`. Tests also use `node:os`
and `node:child_process` for temp folders and real-process restart tests.

**Target Platform**: Any OS that runs Node 22+. Developed on Windows 11 (rename retry included,
see research R5).

**Project Type**: Web service (single-process HTTP JSON API)

**Performance Goals**: Every request < 1 s with ≤ 1,000 stored tasks (SC-005). A full-file write
of 1,000 tasks is about 200 KB, well within budget.

**Constraints**: No frameworks or runtime npm packages. 100 KB request body limit. Error bodies are
exactly `{error, message}`. A rejected request leaves the data file byte-for-byte unchanged.
Config comes from env vars with safe defaults.

**Scale/Scope**: One user, one process, under 1,000 tasks, 5 routes, 63 acceptance criteria
(54 in v1.2 + AC-55 – AC-62 in v1.3 + AC-63 in v1.4).

No `NEEDS CLARIFICATION` items remain. All choices are recorded in [research.md](research.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Constraint | How this plan complies | Pre-design | Post-design |
|---|------------------------|------------------------|------------|-------------|
| I | Zero lint errors | `eslint.config.js` at the repo root covers `src/`, `tests/`, and the config itself; `npm run lint` = `eslint .`; no `eslint-disable` comments | ✅ | ✅ |
| II | No hardcoded secrets | `PORT`, `HOST`, and `DATA_FILE` come from `process.env` with safe defaults (R4); `.gitignore` covers `.env`, `data/`, `node_modules/`; nothing secret exists | ✅ | ✅ |
| III | Validated input & explicit error codes | Every input checked before the store is touched (FR-016/019 order); 400/404/409 with stable codes; error bodies are exactly `{error, message}` and never include stacks or paths; rejected requests never save (AC-48). Rev 1.3: query parameters validated on **every** route (FR-026, AC-55), path ID encoding validated (FR-027, AC-56), tag filter length limited (AC-61). Rev 1.4: path ID limited to 1–100 characters (FR-027, AC-63), so every input has a length limit | ✅ | ✅ |
| IV | Every AC tested | Each test name starts with its AC ID; AC→test-file map below; temp data files only; `node --test` | ✅ | ✅ |
| V | Quality bar integrity | No skip/todo/only; strict asserts (`node:assert/strict`, exact `Content-Type` check, byte comparison for AC-48) | ✅ | ✅ |
| VI | Spec-first change control | Plan follows spec v1.4. The 500 `INTERNAL_ERROR` behaviour found during planning (R12) was added to the spec as revision 1.2 **before** implementation. The `/speckit-analyze` fixes were recorded as spec revision 1.3 before this plan was updated, and the N4/N5 fixes as revision 1.4 | ✅ | ✅ |
| — | Built-in modules only | Production code imports only the 4 named modules; `URL` is a global | ✅ | ✅ |
| — | ESLint the only dev dependency | `devDependencies: { eslint }`; `@eslint/js` comes with eslint (R3) | ✅ | ✅ (fallback in R3 needs human approval) |
| — | Atomic JSON persistence, missing file = empty | R5, R11 | ✅ | ✅ |
| — | Simplicity / YAGNI | 7 small modules, no classes beyond one error type, no extra layers | ✅ | ✅ |

**Gate result: PASS.** Nothing goes in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-todo-task-api/
├── plan.md                 # This file
├── research.md             # Phase 0: design decisions R1–R15 (R15 added for spec rev 1.3)
├── data-model.md           # Phase 1: Task entity, rules, state machine, file format
├── quickstart.md           # Phase 1: setup, gates, smoke & concurrency checks
├── contracts/
│   ├── http-api.md         # Routes, bodies, status codes, check order, error codes
│   └── runtime-config.md   # Env vars, startup/exit behaviour, shutdown
├── checklists/             # (from /speckit-specify)
└── tasks.md                # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
package.json               # "type":"module", scripts: start / test / lint, devDeps: eslint
eslint.config.js           # flat config, covers src/ and tests/
.gitignore                 # node_modules/, data/, *.tmp, .env

src/
├── index.js               # entry: load config → load store → listen → print "Listening on …";
│                          #   startup failure → stderr + exit 1; SIGINT/SIGTERM → graceful close
├── config.js              # read and check PORT, HOST, DATA_FILE (R4)
├── errors.js              # ApiError(status, code, message) + error-code constants
├── http.js                # readBody (100 KB limit, drain, R7), parseJson, sendJson, sendNoContent, sendError
├── tasks.js               # pure domain: validateCreate, validatePatch, normalizeTags, ALLOWED_TRANSITIONS,
│                          #   assertTransition, parseListQuery, filterByTag, sortByPriority, isValidStoredTask
├── store.js               # loadTasks (R11), saveTasks atomic (R5), createStore → { list, get, create,
│                          #   update, remove, idle } with one-at-a-time lock (R6)
└── app.js                 # createApp(store) → (req, res) handler: route table, handlers, error mapping

tests/
├── helpers/
│   ├── server.js          # startServer() in-process on port 0 with a temp DATA_FILE; startProcess() child-process helper
│   └── http.js            # small fetch wrappers: postJson, patchJson, rawRequest(body string)
├── create.test.js         # AC-01 – AC-16
├── read.test.js           # AC-17 – AC-19
├── update.test.js         # AC-20 – AC-27
├── status.test.js         # AC-28 – AC-35
├── delete.test.js         # AC-36 – AC-37
├── filter-sort.test.js    # AC-38 – AC-44, AC-58, AC-61
├── persistence.test.js    # AC-45 – AC-49, AC-62 (child process for restart / exit code)
├── general.test.js        # AC-50 – AC-53, AC-55 – AC-57, AC-59, AC-60, AC-63
├── concurrency.test.js    # AC-54 (in-process burst + child-process restart)
├── tasks.unit.test.js     # unit tests for pure validation, transition, sort, and filter functions
├── store.unit.test.js     # unit tests: atomic save leaves no tmp file, lock order, load errors,
│                          #   failed save leaves memory unchanged and does not block the lock
└── config.unit.test.js    # unit tests for config.js: defaults, valid/invalid PORT, HOST, DATA_FILE
```

`tests/helpers/` files do not match `node --test`'s default patterns (`*.test.js`, `test/**`), so
they are not run as tests.

**Structure Decision**: One project with `src/` and `tests/` at the repo root, as the user asked.
Modules are split by job (config, HTTP helpers, pure domain rules, persistence, routing), not by
layer. `tasks.js` has no I/O, so validation rules can be unit-tested directly. `store.js` is the
only module that touches the file system.

## Request Flow

```text
request
  → app.js: match route (method + path)        ── no match → 404 ROUTE_NOT_FOUND
  → app.js: query on non-list route?           ── yes       → 400 VALIDATION_ERROR   (FR-026)
  → app.js: decodeURIComponent(id)             ── URIError  → 400 VALIDATION_ERROR   (FR-027)
  → app.js: id length 1–100 code points        ── longer    → 400 VALIDATION_ERROR   (FR-027, rev 1.4)
  → http.js: readBody ≤ 102,400 bytes          ── too large → 400 VALIDATION_ERROR   (POST/PATCH only)
  → http.js: JSON.parse                        ── fail      → 400 INVALID_JSON
  → GET /tasks: tasks.parseListQuery           ── bad query → 400 VALIDATION_ERROR
  → store.<op>() inside exclusive lock:
        find id                                 ── missing   → 404 TASK_NOT_FOUND
        tasks.validateCreate / validatePatch    ── invalid   → 400 VALIDATION_ERROR
        tasks.assertTransition                  ── not allowed → 409 INVALID_STATUS_TRANSITION
        next = new array with the change
        await saveTasks(file, next)  (tmp → fsync → rename)
        commit: tasks = next
  → sendJson 200/201 | sendNoContent 204
any thrown ApiError → sendError(status, code, message); anything else → 500 INTERNAL_ERROR (R12)
```

The field check runs inside the lock **after** the existence check. This is how FR-019 puts 404
before 400. It is cheap (pure, synchronous), so the lock is held only briefly.

## Functional Requirements: How Each One Is Handled

| FR | Requirement (short) | Implementation | Verified by |
|----|---------------------|----------------|-------------|
| FR-001 | Exactly 6 fields | `store.create` builds `{id, title, status, priority, tags, createdAt}` in that key order; update copies only those keys; inputs with other keys are rejected | AC-01, AC-14, AC-25, AC-45 |
| FR-002 | System id, unique, unchangeable | `crypto.randomUUID()` (R8); `id` not in allowed PATCH keys; the loader also rejects duplicate ids | AC-01, AC-03, AC-20, AC-25, AC-54 |
| FR-003 | `createdAt` ISO UTC, unchangeable | `new Date().toISOString()` once at create; not in allowed keys | AC-01, AC-20, AC-25 |
| FR-004 | Title 1–200 after trim, stored trimmed | `validateTitle`: `typeof === 'string'`, `trim()`, code-point length 1–200 (R9) | AC-03 – AC-08, AC-22 |
| FR-005 | Status set, start `todo` | Create forces `todo`; `status` value checked against the set before the transition check | AC-01, AC-15, AC-27 |
| FR-006 | Priority set, default medium | `validatePriority`; create default `'medium'` | AC-01, AC-02, AC-09, AC-23 |
| FR-007 | Tags 0–20, 1–50 chars, trimmed, lowercased, deduped in order | `normalizeTags`: array check → length ≤ 20 on the input → each string, trim, length 1–50 → `toLowerCase()` → dedupe with a `Set`, keeping first-seen order | AC-02, AC-10, AC-11, AC-21 |
| FR-008 | `POST /tasks`, status only `todo` | `validateCreate` allows `status === 'todo'` only, else 400 | AC-01 – AC-15 |
| FR-009 | `GET /tasks` creation order | The array is kept in insertion order inside the lock; list returns a copy | AC-17, AC-18 |
| FR-010 | `GET /tasks/{id}` | `store.get(id)` → 404 if missing | AC-18, AC-19 |
| FR-011 | `PATCH` partial update, id/createdAt read-only | `validatePatch`: object, ≥1 key, only the 4 allowed keys; builds a new task object with the changes | AC-20 – AC-27 |
| FR-012 | `DELETE` | `store.remove` → new array without the task → save → 204 | AC-36, AC-37 |
| FR-013 | Tag filter, trimmed + lowercased, 1–50 chars; only `tag`/`sort`, each once | `parseListQuery` → `filterByTag(list, tag)` | AC-38 – AC-41, AC-44, AC-58, AC-61 |
| FR-014 | Priority sort, stable, combinable | `sortByPriority`: copy, then `Array.prototype.sort` (stable) by rank `{high:0, medium:1, low:2}`; filter before sort | AC-42 – AC-44 |
| FR-015 | Only 3 transitions; same value → 409 | `ALLOWED_TRANSITIONS` table; `assertTransition(from, to)` throws 409 if `to` is not in the list | AC-28 – AC-35 |
| FR-016 | Validate fully before changing; all-or-nothing | All checks finish before `next` is built; memory is committed only after the save succeeds (R6) | AC-16, AC-22, AC-31, AC-35, AC-48, AC-57 |
| FR-017 | Status code / error code table | `errors.js` constants; every error comes from an `ApiError`; empty body → `INVALID_JSON`; `HEAD`/`OPTIONS`/`/tasks/` → `ROUTE_NOT_FOUND` | all 4xx ACs, AC-57, AC-59, AC-60 |
| FR-018 | Error body exactly `{error, message}`, no stack/path | `sendError` builds only those two keys; unknown errors → generic 500 (R12); details go to stderr only | AC-51, AC-57 |
| FR-019 | Check order: route → query/ID → size → JSON → 404 → 400 → 409 | Request flow above; query/ID, size and JSON checks before the lock, existence before field validation inside it | AC-52, AC-53, AC-55, AC-56 |
| FR-020 | Success codes and content type | `sendJson(res, status, body)` sets exactly `application/json`; delete uses `sendNoContent` with no body | AC-01, AC-17, AC-20, AC-36, AC-51 |
| FR-021 | Save after every change, identical after restart | `saveTasks` writes the full ordered array inside the lock before the reply; loader keeps order | AC-45, AC-46, AC-54 |
| FR-022 | Missing file = empty; invalid file = refuse to start, file untouched | `loadTasks` (R11): ENOENT → `[]`; otherwise strict checks → `DataFileError` → `index.js` exits 1 with no write | AC-47, AC-49 |
| FR-023 | Port and data path configurable; invalid value → refuse to start | `config.js` reads `PORT`, `DATA_FILE` (+ `HOST`) with defaults (R4); invalid value throws → `index.js` exits 1 | AC-45 – AC-49, AC-54 (tests set `PORT=0` and a temp `DATA_FILE`), AC-62, `config.unit.test.js` |
| FR-024 | 100 KB limit before JSON parse | `readBody` streamed byte count with drain (R7) | AC-52 |
| FR-025 | Simultaneous changes all saved; file always valid | Promise-chain lock + atomic rename (R5, R6) | AC-54 |
| FR-026 | No query parameters except on `GET /tasks` | Route handler checks `url.searchParams.size > 0` on non-list routes → 400 before reading the body (R10) | AC-55 |
| FR-027 | Bad `{id}` percent-encoding → 400; ID over 100 chars → 400 | `decodeURIComponent` wrapped in try/catch; `URIError` → `validationError` (R15); then `codePointLength(id) > 100` → `validationError` before any store call (R15, rev 1.4) | AC-56, AC-63 |

## Risky Acceptance Criteria: How Each One Is Handled

These ACs are the ones most likely to fail through a subtle mistake. Each row names the risk and
the specific design choice that prevents it.

| AC | Risk | How it is handled |
|----|------|-------------------|
| **AC-54** concurrency | Two creates read the same list, and the second save overwrites the first. Or two `rename`s race (on Windows `EPERM`), so a request fails or a task is lost. | All changes run through `exclusive()` (R6). Each one rebuilds `next` from the **latest committed** list, then saves, then commits. Writes never overlap. Each temp file has a unique name (`pid` + UUID). Windows rename retry (R5). The test fires 20 `fetch` calls with `Promise.all` (no awaits between them), asserts 20×201, 20 distinct ids, the set of titles T1–T20, then restarts a **child process** on the same file and asserts the same 20 tasks. |
| **AC-45 / AC-46** restart | Order or values change after reload; data written after the reply is lost when the process is killed. | The full ordered array is saved before replying. The loader keeps array order. The test compares `GET /tasks` before and after a real process restart with `deepStrictEqual`. |
| **AC-48** file unchanged on reject | A rejected request still saves (for example an "update then throw" pattern), or any write changes formatting. | Rejections throw before `saveTasks` is called. No code path writes without a change. The test compares the raw file `Buffer` before and after each listed request. |
| **AC-49** corrupt file | The service starts empty and later overwrites the user's file; or the error is caught and the exit code is 0. | `loadTasks` throws `DataFileError`. `index.js` sets `process.exitCode = 1` before any listen or save. The test spawns the process, asserts a non-zero exit code, and checks the file still says `not json`. |
| **AC-52** oversized body | The JSON parser runs first and returns `INVALID_JSON`; or the socket is destroyed and the client sees `ECONNRESET` instead of 400. | Streamed byte count before parsing; on overflow keep draining, then reply 400 `VALIDATION_ERROR` (R7). The test body is `'a'.repeat(102401)` (not JSON) to prove the order, on both POST and PATCH. |
| **AC-53** check order | Field validation runs before lookup, so an unknown id with a bad body returns 400. | Size and JSON checks run before the lock; existence then fields inside it (Request Flow). Tests cover both sub-cases. |
| **AC-35** mixed valid + invalid change | The title is applied before the status check fails. | The task object is never changed in place; the new object and array are built only after `assertTransition` passes. The test checks a later GET for both title and status. |
| **AC-34** same-status change | `if (from === to) return ok` style shortcut. | The transition table has no self-loops; there is no shortcut. Tested for all 3 statuses. |
| **AC-27 vs AC-31** 400 vs 409 | An unknown status value returns 409, or a disallowed transition returns 400. | The value check (set membership) is part of field validation (400); only a valid value reaches `assertTransition` (409). |
| **AC-15** status on create | `status:"done"` on create returns 409 because the lifecycle code is reused. | Create validation allows only `'todo'` and returns 400; the transition code is not called on create. |
| **AC-13** body `null` / array | `typeof null === 'object'` and arrays pass an "is object" check. | `isPlainObject(v)`: `v !== null && typeof v === 'object' && !Array.isArray(v)`. |
| **AC-14 / AC-25** read-only and unknown keys | Extra keys are ignored silently, or `id` is copied into the task. | Strict list of allowed keys; any other key → 400 naming the key. Tasks are built field by field, never with object spread of the input. |
| **AC-02 / AC-40** tag case | Dedupe before lowercasing keeps both `Home` and `home`; the filter is case-sensitive. | Order: trim → lowercase → dedupe. The filter value goes through the same trim → lowercase steps. |
| **AC-05 / AC-08** trim + length bounds | The length is checked before trimming; off-by-one at 200/201. | Trim first, then check the length; tests at 200 (201 created) and 201 (400). |
| **AC-11** tag limits | Count checked after dedupe, so 21 tags with duplicates pass. | The count limit is on the input array (R10/data-model). Each tag's type and length are checked before normalizing. |
| **AC-41** empty tag | `?tag=` treated as "no filter". | `searchParams.has('tag')` with an empty value after trim → 400. |
| **AC-42 / AC-44** stable sort | The sort changes the stored array, or ties end up out of order. | Sort a **copy**; V8 sort is stable; filter first, then sort. |
| **AC-50** `PUT /tasks` | It falls through to a 405 or to the create handler. | The route table matches method **and** path; anything else → 404 `ROUTE_NOT_FOUND`. |
| **AC-51** headers and error shape | `application/json; charset=utf-8` fails a strict check; stack traces leak from the 500 path. | Exact header value `application/json` (R13). One `sendError` builds `{error, message}` only. The test checks keys with `deepStrictEqual(Object.keys(body).sort(), ['error','message'])` and checks that `message` has no `\n    at ` and no path separators followed by `src`. |
| **AC-01 / AC-03** id and timestamp | `createdAt` is not a strict ISO UTC string; ids collide. | `toISOString()` always gives `YYYY-MM-DDTHH:mm:ss.sssZ`; the test checks it with a regex **and** `new Date(x).toISOString() === x`. UUIDs for ids. |
| **AC-47** missing file | Startup crashes on ENOENT or creates an empty file. | ENOENT → `[]`; the file is created only on the first change. |
| **AC-55** query on non-list routes | The check runs after the body is read or after the store changes, so `POST /tasks?x=1` still creates a task. | Checked in `app.js` right after the route match, before `readBody` and before any store call. The test checks `GET /tasks` afterwards. |
| **AC-56** bad ID encoding | `decodeURIComponent` throws `URIError`, which falls into the generic 500 branch. | try/catch around the decode only; `URIError` → 400 `VALIDATION_ERROR`. |
| **AC-57** failed save | Memory is committed before the save, so the API shows a task that is not on disk; or the failed step leaves the lock chain rejected so every later request fails. | Commit only after `saveTasks` resolves (R6); `tail = run.catch(() => {})` keeps the queue alive. The test makes the save fail by putting a regular file where the data folder should be (works on Windows and POSIX, no mocks), then removes it and checks a later create works. |
| **AC-62** bad config | `PORT=abc` becomes `NaN` and `listen` picks a random port, or the error prints a stack trace. | `config.js` validates with `/^\d+$/` and range; `index.js` prints `Failed to start: <message>` and sets exit code 1 before loading or writing anything. |
| **AC-63** long ID | The length check runs after the store lookup, so a 101-character ID gives 404; or it is counted before decoding, so `%61` counts as 3 characters. | Checked in `app.js` right after decoding and before any store call, counting code points of the decoded ID (R9, R15). The test sends 101 `a` characters (400 on GET, PATCH, DELETE) and 100 `a` characters (404). |

## Test → AC Traceability (planned)

| File | ACs |
|------|-----|
| `tests/create.test.js` | AC-01 – AC-16 |
| `tests/read.test.js` | AC-17 – AC-19 |
| `tests/update.test.js` | AC-20 – AC-27 |
| `tests/status.test.js` | AC-28 – AC-35 |
| `tests/delete.test.js` | AC-36 – AC-37 |
| `tests/filter-sort.test.js` | AC-38 – AC-44, AC-58, AC-61 |
| `tests/persistence.test.js` | AC-45 – AC-49, AC-62 |
| `tests/general.test.js` | AC-50 – AC-53, AC-55, AC-56, AC-57, AC-59, AC-60, AC-63 |
| `tests/concurrency.test.js` | AC-54 |

Every test name starts with its AC ID (for example `AC-31: todo → done returns 409 and keeps status`).
Unit tests (`*.unit.test.js`) are extra and do not replace the AC tests.

## Open Items / Follow-ups

1. ~~Spec revision 1.2~~: **done (2026-11-10)**. FR-017 now has the `500 INTERNAL_ERROR` row
   (R12). No AC changed.
2. **ESLint packaging (R3)**: if `@eslint/js` cannot be resolved from the top level of
   `node_modules`, a human must approve adding it to `devDependencies`.
3. ~~Spec revision 1.3~~: **done (2026-11-10)**. Added FR-026, FR-027 and AC-55 – AC-62 from the
   `/speckit-analyze` findings (C1, C2, G1, G2, U1, U2, G3). This plan was updated in place (see
   below); no earlier decision was removed.
4. ~~Spec revision 1.4~~: **done (2026-11-10)**. FR-027 ID length limit (AC-63) and AC-51 widened
   to AC-04 – AC-63 (findings N5, N4). Plan updated in place.

## Revision 1.3 updates (2026-11-10)

| Finding | Change in this plan |
|---------|---------------------|
| C1 (Constitution III: query params on every route) | Request Flow step "query on non-list route → 400"; FR-026 row; AC-55 risk row |
| C2 (bad `%` encoding → 500) | Request Flow step "decode id → 400"; FR-027 row; AC-56 risk row |
| G1 (500 path untested) | FR-016/017/018 rows cite AC-57; AC-57 risk row; `store.unit.test.js` covers failed save |
| G2 (AC-51 sampled) | Test rule: every AC test asserts through `assertJsonResponse` / `assertError` (see tasks.md global rules) |
| U1 (behaviour only in research) | FR-013 / FR-017 rows cite AC-58, AC-59, AC-60 |
| U2 (tag filter length) | FR-013 row: 1–50 chars; AC-61 |
| G3 (config untested) | FR-023 row cites AC-62 and `config.unit.test.js`; AC-62 risk row |

## Revision 1.4 updates (2026-11-10)

| Finding | Change in this plan |
|---------|---------------------|
| N5 (path ID had no length limit, constitution III) | Request Flow step "id length 1–100 → 400"; FR-027 row cites AC-63; AC-63 risk row; Constitution Check row III |
| N4 (AC-51 range stopped at AC-50) | No design change: AC-51 now covers AC-04 – AC-63, and the existing "every AC test uses `assertJsonResponse` / `assertError`" rule already checks those responses |

## Complexity Tracking

No constitution violations; nothing to justify.
