---

description: "Task list for the Todo Task REST API (001-todo-task-api)"
---

# Tasks: Todo Task REST API

**Input**: Design documents from `/specs/001-todo-task-api/` (spec v1.4; this file was updated in
place on 2026-11-10 for rev 1.3: AC-55 – AC-62 added to existing tasks, new task T051; and for
rev 1.4: AC-63 added to T010/T043, AC-51 range widened to AC-63. No task was removed or
renumbered.)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [contracts/runtime-config.md](contracts/runtime-config.md), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. Constitution Principle IV says every AC (AC-01 – AC-63) must have an automated
`node:test` test whose name starts with the AC ID (e.g. `test('AC-31: todo → done returns 409 and keeps status', …)`).
Write each story's tests first and confirm they fail before implementing (route returns 404 /
assertion fails). Never use `skip`, `todo`, `only`, or `eslint-disable` (Principle V).

**Organization**: Tasks are grouped by user story. Story labels match spec.md numbering
(US1 … US5). Phase order follows priority, except that US5 (P1) runs after US3 (P2) because AC-46
and AC-48 need `DELETE` (see Dependencies).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1 … US5)

## Global rules for every task (from plan / constitution)

- ES modules; import built-ins with the `node:` prefix. Production code (`src/`) may import ONLY
  `node:http`, `node:fs` / `node:fs/promises`, `node:path`, `node:crypto`. `URL` is a global.
  Tests may also use `node:test`, `node:assert/strict`, `node:os`, `node:child_process`.
- Every JSON response: header exactly `Content-Type: application/json` (no charset) plus
  `Content-Length`. Every error body is exactly `{ "error": <CODE>, "message": <non-empty string> }`
  with no stack trace or file path.
- Check order (FR-019): route match → query parameter on a non-list route (400 `VALIDATION_ERROR`,
  FR-026) → `{id}` not valid percent-encoding or longer than 100 characters after decoding (400 `VALIDATION_ERROR`, FR-027) → body > 102,400 bytes (400 `VALIDATION_ERROR`) → JSON parse
  (400 `INVALID_JSON`) → *inside store lock:* task not found (404 `TASK_NOT_FOUND`) → field
  validation (400 `VALIDATION_ERROR`) → status transition (409 `INVALID_STATUS_TRANSITION`).
- Rejected requests never call `saveTasks`. Memory is committed only after a save succeeds.
- Tests always use a temp `DATA_FILE` under `fs.mkdtemp(os.tmpdir())`; never `data/tasks.json`.
- After each task: `npx eslint .` must report 0 errors.
- Every AC test asserts responses only through `assertJsonResponse` (success with a body) or
  `assertError` (errors) from `tests/helpers/http.js`; a raw `assert.equal(res.status, …)` alone is
  not enough. This is how AC-51 is covered for **every** response, not a sample. Exceptions: 204
  (AC-36, checked as empty body with no `content-type`) and `HEAD` (AC-60, status only, no body).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization at the repository root `D:\Personal\Assignment-1\Part-1A`.

- [x] T001 Create `package.json` at repo root with `"name": "todo-task-api"`, `"version": "1.0.0"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=22" }`, `"scripts": { "start": "node src/index.js", "test": "node --test", "lint": "eslint ." }`, and `"devDependencies": { "eslint": "^9" }`. No `dependencies` key (no runtime npm packages).
- [x] T002 [P] Create `.gitignore` at repo root containing `node_modules/`, `data/`, `*.tmp`, `.env`.
- [x] T003 [P] Create `eslint.config.js` (flat config, research R3): `import js from '@eslint/js'`; export an array with `js.configs.recommended` and an entry for `files: ['src/**/*.js', 'tests/**/*.js', 'eslint.config.js']` with `languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly' } }`; `ignores: ['node_modules/']` only. Do not add the `globals` package.
- [x] T004 Run `npm install`, then verify `node -e "import('@eslint/js').then(()=>console.log('ok'))"` prints `ok` and `npx eslint .` exits 0. If `@eslint/js` cannot be resolved, STOP and ask a human to approve adding `@eslint/js` to `devDependencies` (plan Open Item 2; do not add it yourself).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Errors, config, HTTP helpers, field validators, atomic store, router, entry point, and test helpers that every story uses.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 [P] Create `src/errors.js`: export `ERROR_CODES = { INVALID_JSON: 'INVALID_JSON', VALIDATION_ERROR: 'VALIDATION_ERROR', TASK_NOT_FOUND: 'TASK_NOT_FOUND', ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND', INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION', INTERNAL_ERROR: 'INTERNAL_ERROR' }`; `class ApiError extends Error` with constructor `(status, code, message)` storing `status` and `code`; helper factories `validationError(message)` (400), `invalidJson(message)` (400), `taskNotFound(id)` (404, message `Task '<id>' not found`), `routeNotFound(method, path)` (404), `invalidTransition(from, to)` (409, message `Cannot change status from '<from>' to '<to>'`); and `class DataFileError extends Error` (used by the loader). Messages must never include stack traces or file system paths.
- [x] T006 [P] Create `src/config.js` (research R4, contracts/runtime-config.md): export `loadConfig(env = process.env)` returning `{ port, host, dataFile }`. `PORT` default `3000`, must match `/^\d+$/` and be an integer `0`–`65535` (0 = any free port). `HOST` default `127.0.0.1`, must be a non-empty string after trim. `DATA_FILE` default `path.resolve(import.meta.dirname, '..', 'data', 'tasks.json')`; if set it must be non-empty and is resolved with `path.resolve(value)` (relative to cwd). An invalid value throws `Error` with a clear message (e.g. `Invalid PORT: "abc" (expected integer 0-65535)`). No secrets, no `.env` loading.
- [x] T007 [P] Create `src/http.js` (research R7, R13): export `MAX_BODY_BYTES = 102400`; `readBody(req, limit = MAX_BODY_BYTES)` returning a Promise<string> that counts bytes of each chunk as it arrives, stops keeping chunks once the total exceeds `limit` but **keeps reading to `end`** (never destroys the socket), then rejects with `validationError('Request body must not exceed 102400 bytes')`; otherwise resolves `Buffer.concat(chunks).toString('utf8')`. `parseJson(text)` returns `JSON.parse(text)` or throws `invalidJson('Request body is not valid JSON')` (an empty string is also `INVALID_JSON`). `sendJson(res, status, body)` writes `JSON.stringify(body)` with headers exactly `Content-Type: application/json` and `Content-Length: Buffer.byteLength(payload)`. `sendNoContent(res)` sends 204 with no body and no `Content-Type`. `sendError(res, status, code, message)` calls `sendJson(res, status, { error: code, message })` — exactly those two keys.
- [x] T008 [P] Create `src/tasks.js` (pure, no I/O) with the field-level rules from data-model.md: export `STATUSES = ['todo', 'in-progress', 'done']`, `PRIORITIES = ['low', 'medium', 'high']`, `TASK_KEYS = ['id', 'title', 'status', 'priority', 'tags', 'createdAt']`, `INPUT_KEYS = ['title', 'priority', 'tags', 'status']`; `isPlainObject(v)` = `v !== null && typeof v === 'object' && !Array.isArray(v)`; `codePointLength(s)` = `[...s].length` (R9); `validateTitle(v)` → `typeof v === 'string'`, `trim()`, then "1–200 code points after trim; trimmed value stored", returns the trimmed string or throws `validationError` naming `title`; `validatePriority(v)` → must be one of `"low" | "medium" | "high"` else 400; `validateStatusValue(v)` → must be one of `"todo" | "in-progress" | "done"` else 400; `normalizeTags(v)` → in this exact order: must be an array, "Input array length 0–20" (checked on the input array before dedupe), "each item a string, 1–50 code points after trim", then "stored trimmed and lowercased; duplicates (after lowercasing) removed, first-seen order kept" (use a `Set`), returns the new array. A value of `null` for any field is a wrong type (400), never "use the default". Also export `isValidStoredTask(t)`: plain object with exactly the six `TASK_KEYS`, `id` a non-empty string, `title`/`priority`/`status`/`tags` valid per the rules above and already normalized (stored title equals its trim, tags already lowercase/trimmed/unique), `createdAt` a string matching `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` and `new Date(x).toISOString() === x`.
- [x] T009 Create `src/store.js` (research R5, R6, R11; depends on T005, T008): export `async loadTasks(file)` — `ENOENT` → `[]` (do not create the file); otherwise read UTF-8, `JSON.parse`, require a top-level array where every item passes `isValidStoredTask` and all `id`s are unique; any failure (including an empty file) throws `DataFileError` with a reason. Export `async saveTasks(file, tasks)` — `mkdir(dirname(file), { recursive: true })`; temp path `${file}.${process.pid}.${randomUUID()}.tmp` in the same directory; open with flag `'wx'`, write `JSON.stringify(tasks, null, 2) + '\n'`, `await fh.sync()`, close; `rename(tmp, file)` retrying on `EPERM`/`EBUSY`/`EACCES` up to 5 times with waits 10, 20, 40, 80, 160 ms; on any failure delete the temp file (best effort, ignore errors) and re-throw. Export `createStore(file, initialTasks)` returning `{ list, get, idle, exclusive }` (create/update/remove are added by stories) where: `let tasks = initialTasks`; `let tail = Promise.resolve()`; `exclusive(fn)` = `const run = tail.then(fn); tail = run.catch(() => {}); return run;`; `list()` returns a shallow copy of the committed array; `get(id)` returns the task or throws `taskNotFound(id)`; `idle()` returns `tail`; plus an internal `commit(next)` helper used only after `await saveTasks(file, next)` succeeds. Never mutate a stored task object or the committed array in place.
- [x] T010 Create `src/app.js` (depends on T005, T007, T009): export `createApp(store)` returning an `async (req, res)` handler. Parse `new URL(req.url, 'http://localhost')`. Hold a route table of `{ method, pattern, handler }` where `pattern` is either the exact path `/tasks` or the regex `^/tasks/([^/]+)$` (id = `decodeURIComponent(match[1])` **inside a try/catch: a `URIError` → `validationError('Task id is not valid URL encoding')`**, FR-027, R15; *then, rev 1.4:* if `codePointLength(id) > 100` (import from `src/tasks.js`) → `validationError('Task id must be at most 100 characters')`, before any store call, FR-027, AC-63); match **method AND path**; no match (including `PUT /tasks`, `HEAD`, `OPTIONS`, `/tasks/`, `/unknown`) → 404 `ROUTE_NOT_FOUND`. After a route matches and before its handler reads the body: if the route is not `GET /tasks` and `url.searchParams.size > 0`, throw `validationError('Query parameters are not supported on this route')` (FR-026, R10). Start with an empty table and export a way for later tasks to add handlers in this same file (stories add entries directly to the table literal). Wrap every handler in try/catch: `ApiError` → `sendError(res, err.status, err.code, err.message)`; anything else → `console.error(err)` and `sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error')`.
- [x] T011 Create `src/index.js` (contracts/runtime-config.md; depends on T006, T009, T010): `loadConfig()` → `loadTasks(dataFile)` → `createStore(dataFile, tasks)` → `http.createServer(createApp(store))` → `listen(port, host)`; on `listening` print exactly one stdout line `Listening on http://<host>:<actual port>` using `server.address().port`. On any startup failure (bad config, `DataFileError`, listen error such as `EADDRINUSE`) write `Failed to start: <reason>` to stderr (message only, no stack), set `process.exitCode = 1`, and never call `saveTasks`. Do not use `process.exit()` before stderr flushes.
- [x] T012 [P] Create `tests/helpers/server.js` (research R14): export `async makeTempDir()` (`fs.mkdtemp(path.join(os.tmpdir(), 'todo-api-'))`); `async startServer({ dataFile } = {})` that creates a temp dir if no `dataFile`, calls `loadTasks` + `createStore` + `createApp`, listens on `127.0.0.1:0`, and returns `{ baseUrl, dataFile, store, close }` (`close` awaits `store.idle()` then `server.close()`); `async startProcess({ dataFile, env = {} })` that spawns `process.execPath` with `src/index.js` (path resolved from `import.meta.dirname`), env `{ ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_FILE: dataFile, ...env }`, resolves when stdout emits `Listening on http://127.0.0.1:<port>` and returns `{ baseUrl, child, stop }` (`stop` = `child.kill()` + await `exit`); and `runProcessToExit({ dataFile, env })` resolving `{ code, stderr }` for startup-failure tests (timeout 10 s).
- [x] T013 [P] Create `tests/helpers/http.js`: export `request(baseUrl, method, path, { json, raw } = {})` using global `fetch` (`json` → `JSON.stringify`, `raw` → body string sent as-is) returning `{ status, headers, text, body }` (`body` = parsed JSON when text non-empty); thin wrappers `post`, `patch`, `get`, `del`; `assertJsonResponse(res, status)` → `assert.equal(res.status, status)` and `assert.equal(res.headers.get('content-type'), 'application/json')`; `assertError(res, status, code)` → `assertJsonResponse`, `assert.deepEqual(Object.keys(res.body).sort(), ['error', 'message'])`, `assert.equal(res.body.error, code)`, `message` is a non-empty string, and `message` does not match `/\n\s+at /` nor `/[\\/]src[\\/]/`. Use `node:assert/strict` only.
- [x] T014 [P] Create `tests/tasks.unit.test.js` with unit tests for T008: `normalizeTags(['Home','urgent','home'])` → `['home','urgent']`; `[' Work ']` → `['work']`; 21 tags with duplicates → throws; `[1]`, `['']`, 51-char tag, `'home'`, `null` → throw `ApiError` 400; `validateTitle('  Pay rent  ')` → `'Pay rent'`; 200 chars ok / 201 chars throws; emoji counts as 1 code point; `isPlainObject(null|[]|'x')` false; `isValidStoredTask` accepts a valid task, rejects extra key, missing key, uppercase tag, bad `createdAt`.
- [x] T015 [P] Create `tests/store.unit.test.js`: `loadTasks` on missing file → `[]` and file still absent; on `not json`, `{}`, empty file, invalid task, duplicate ids → rejects with `DataFileError` and file bytes unchanged; `saveTasks` writes 2-space JSON + trailing newline and leaves no `*.tmp` in the directory; `exclusive` runs 3 queued async functions strictly in order even when earlier ones are slower, and a thrown error in one does not block the next. *(Rev 1.3, G1)* Failed save: `saveTasks` to a path whose parent is a regular file rejects and leaves no `*.tmp`; and, using only Phase 2 functions, `createStore(<that path>, [])` then `store.exclusive(() => saveTasks(<that path>, [sampleValidTask]))` rejects, `store.list()` is still `[]` afterwards, and a following `store.exclusive(fn)` still runs (the lock is not stuck). The same behaviour through the real `create()` route is tested end to end by AC-57 in T043, after T019 exists.
- [x] T051 [P] *(Added for spec rev 1.3, finding G3)* Create `tests/config.unit.test.js` for T006: defaults (`port` 3000, `host` `127.0.0.1`, `dataFile` ends with `data/tasks.json` / `data\tasks.json` and is absolute); `PORT` `'0'` and `'65535'` accepted; `'abc'`, `'-1'`, `'65536'`, `'3.5'`, and `''` each throw; `HOST='  '` throws; `DATA_FILE=''` throws; a relative `DATA_FILE` resolves against `process.cwd()`. Pass an env object to `loadConfig(env)`; never change `process.env`.

**Checkpoint**: `npx eslint .` → 0 errors; `node --test` → unit tests pass; `npm start` prints `Listening on http://127.0.0.1:3000` and every request returns 404 `ROUTE_NOT_FOUND`.

---

## Phase 3: User Story 1 - Create and view tasks (Priority: P1) 🎯 MVP

**Goal**: `POST /tasks`, `GET /tasks`, `GET /tasks/{id}` with full create validation.

**Independent Test**: Start with an empty temp data file, create tasks, read them back by ID and as a list (AC-01 – AC-19).

### Tests for User Story 1 (write first, confirm they fail) ⚠️

- [x] T016 [P] [US1] Create `tests/create.test.js` using `startServer()` (fresh temp file per test) and `assertError`, with one test per AC named `AC-NN: …`: AC-01 (`{"title":"Buy milk"}` → 201, non-empty string `id`, `title` `"Buy milk"`, `status` `"todo"`, `priority` `"medium"`, `tags` `[]`, `createdAt` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` and `new Date(x).toISOString() === x`, `Object.keys` exactly the six fields); AC-02 (`{"title":"Clean","priority":"high","tags":["Home","urgent","home"]}` → 201, `priority` `"high"`, `tags` `["home","urgent"]`); AC-03 (`"  Pay rent  "` → `"Pay rent"`; two creates have different ids); AC-04 (`""`), AC-05 (`"   "`), AC-06 (`{}`), AC-07 (`123`) → 400 `VALIDATION_ERROR`; AC-08 (`'x'.repeat(201)` → 400, `'x'.repeat(200)` → 201); AC-09 (`priority:"urgent"`); AC-10 (`tags:"home"`); AC-11 (four sub-cases: `[1]`, `[""]`, 51-char tag, 21 distinct tags); AC-12 (raw body `{"title":` → 400 `INVALID_JSON`); AC-13 (raw `["Buy milk"]` and raw `null` → 400 `VALIDATION_ERROR`); AC-14 (`id`, `createdAt`, `color` extra keys → 400 each); AC-15 (`status:"done"` → 400 `VALIDATION_ERROR`, `status:"todo"` → 201); AC-16 (for every rejected body in AC-04 – AC-15, `GET /tasks` length is the same before and after). All responses checked with `assertJsonResponse`/`assertError` (also covers AC-51 for these).
- [x] T017 [P] [US1] Create `tests/read.test.js`: AC-17 (empty store `GET /tasks` → 200, body `[]`, content type `application/json`); AC-18 (create A, B, C in sequence → `GET /tasks` 200 with exactly 3 tasks titled A, B, C in that order; `GET /tasks/{B.id}` → 200 and `deepEqual` to B's create response); AC-19 (`GET /tasks/does-not-exist` → 404 `TASK_NOT_FOUND`).

### Implementation for User Story 1

- [x] T018 [US1] Add `validateCreate(body)` to `src/tasks.js`: body must be `isPlainObject` else 400 `Request body must be a JSON object`; any key not in `INPUT_KEYS` (including `id`, `createdAt`) → 400 naming the key (e.g. `Unknown or read-only field: color`); `title` required → `validateTitle`; `priority` optional → `validatePriority`, default `'medium'`; `tags` optional → `normalizeTags`, default `[]`; `status` optional and only the value `"todo"` is accepted (anything else, including other valid statuses, → 400 `VALIDATION_ERROR`; never call the transition code). Returns `{ title, priority, tags }`.
- [x] T019 [US1] Add `create(body)` to the object returned by `createStore` in `src/store.js`: inside `exclusive`: `const input = validateCreate(body)`; build the task **field by field in this key order** `{ id: randomUUID(), title, status: 'todo', priority, tags, createdAt: new Date().toISOString() }`; `next = [...tasks, task]`; `await saveTasks(file, next)`; commit; return task.
- [x] T020 [US1] Add route `POST /tasks` to the table in `src/app.js`: `const text = await readBody(req)` → `const body = parseJson(text)` → `const task = await store.create(body)` → `sendJson(res, 201, task)`.
- [x] T021 [US1] Add route `GET /tasks` to `src/app.js` returning `sendJson(res, 200, store.list())` (query handling is added in US4).
- [x] T022 [US1] Add route `GET /tasks/{id}` to `src/app.js` returning `sendJson(res, 200, store.get(id))` (404 `TASK_NOT_FOUND` comes from `store.get`).
- [x] T023 [P] [US1] Extend `tests/tasks.unit.test.js` with `validateCreate` cases: defaults applied, `status:"todo"` accepted, `status:"in-progress"` rejected 400, `priority:null` rejected 400, extra key rejected 400.

**Checkpoint**: `node --test` → `create.test.js` and `read.test.js` pass (AC-01 – AC-19); lint 0 errors. MVP usable.

---

## Phase 4: User Story 2 - Move a task through its lifecycle (Priority: P1)

**Goal**: `PATCH /tasks/{id}` with strict status transitions (`todo → in-progress`, `in-progress → done`, `in-progress → todo` only), all-or-nothing.

**Independent Test**: Create a task, send every allowed and disallowed status change, check status code and stored status after each (AC-28 – AC-35).

### Tests for User Story 2 (write first, confirm they fail) ⚠️

- [x] T024 [P] [US2] Create `tests/status.test.js` (helper: create a task and PATCH it into the needed starting status through allowed steps): AC-28 (`todo` → `{"status":"in-progress"}` → 200, `status` `"in-progress"`); AC-29 (`in-progress` → `done` → 200); AC-30 (`in-progress` → `todo` → 200); AC-31 (`todo` → `done` → 409 `INVALID_STATUS_TRANSITION`, then `GET` shows `"todo"`); AC-32 (`done` → `in-progress` → 409); AC-33 (`done` → `todo` → 409); AC-34 (same-value changes `todo→todo`, `in-progress→in-progress`, `done→done` each → 409 and status unchanged); AC-35 (task titled `"Old"` in `todo`, PATCH `{"title":"New","status":"done"}` → 409, then `GET` shows `title` `"Old"` and `status` `"todo"`).

### Implementation for User Story 2

- [x] T025 [US2] Add to `src/tasks.js`: `ALLOWED_TRANSITIONS = { todo: ['in-progress'], 'in-progress': ['done', 'todo'], done: [] }` (no self-loops, no `from === to` shortcut) and `assertTransition(from, to)` that throws `invalidTransition(from, to)` (409) unless `ALLOWED_TRANSITIONS[from].includes(to)`.
- [x] T026 [US2] Add `validatePatch(body)` to `src/tasks.js`: must be `isPlainObject` else 400; at least one key (`{}` → 400 `Request body must contain at least one field`); any key not in `INPUT_KEYS` (including `id`, `createdAt`) → 400 naming the key; each present key validated with `validateTitle` / `validatePriority` / `normalizeTags` / `validateStatusValue` (status value not one of the 3 → 400, AC-27). Returns an object containing only the present, normalized fields. Does not check transitions.
- [x] T027 [US2] Add `update(id, body)` to `createStore` in `src/store.js`: inside `exclusive`: find index by id → missing → `taskNotFound(id)` (404, before field validation per FR-019); `const changes = validatePatch(body)` (400); if `'status' in changes` → `assertTransition(current.status, changes.status)` (409) against the latest committed status; build a **new** task field by field in key order `{ id, title, status, priority, tags, createdAt }` taking each from `changes` if present else `current` (never spread the input; `id` and `createdAt` always from `current`); `next` = copy of array with that index replaced; `await saveTasks(file, next)`; commit; return the new task.
- [x] T028 [US2] Add route `PATCH /tasks/{id}` to `src/app.js`: `readBody` (400 if too large) → `parseJson` (400 `INVALID_JSON`) → `await store.update(id, body)` → `sendJson(res, 200, task)`.
- [x] T029 [P] [US2] Extend `tests/tasks.unit.test.js`: `assertTransition` for all 9 from/to pairs (exactly the 3 allowed pass, the 6 others throw 409); `validatePatch({})` → 400, `validatePatch({status:'archived'})` → 400, `validatePatch({tags:['A','a']})` → `{tags:['a']}`.

**Checkpoint**: `status.test.js` passes (AC-28 – AC-35); US1 tests still pass.

---

## Phase 5: User Story 3 - Edit and delete tasks (Priority: P2)

**Goal**: Field edits via `PATCH` (title, priority, tags) with full validation, and `DELETE /tasks/{id}`.

**Independent Test**: Create a task, update fields, delete it, confirm with reads (AC-20 – AC-27, AC-36 – AC-37). Uses the `PATCH` route from US2.

### Tests for User Story 3 (write first, confirm they fail) ⚠️

- [x] T030 [P] [US3] Create `tests/update.test.js`: AC-20 (`{"title":"New title"}` → 200, `title` `"New title"`, same `id` and `createdAt`; following `GET` returns new title); AC-21 (`{"priority":"low","tags":["work"]}` → 200, `priority` `"low"`, `tags` `["work"]`, `title`/`status`/`id`/`createdAt` unchanged); AC-22 (`{"title":""}` → 400 `VALIDATION_ERROR`, `GET` still old title); AC-23 (`{"priority":"urgent"}` → 400); AC-24 (`{}` → 400); AC-25 (`{"id":"x"}`, `{"createdAt":"2020-01-01T00:00:00Z"}`, `{"color":"red"}` → 400 each, task unchanged); AC-26 (`PATCH /tasks/does-not-exist` `{"title":"X"}` → 404 `TASK_NOT_FOUND`); AC-27 (`{"status":"archived"}` → 400 `VALIDATION_ERROR`, not 409).
- [x] T031 [P] [US3] Create `tests/delete.test.js`: AC-36 (`DELETE /tasks/{id}` → 204, empty body text `''`, no `content-type` header; then `GET /tasks/{id}` → 404 `TASK_NOT_FOUND` and task absent from `GET /tasks`); AC-37 (`DELETE /tasks/does-not-exist` → 404 `TASK_NOT_FOUND`; deleting an existing task twice → second call 404).

### Implementation for User Story 3

- [x] T032 [US3] Add `remove(id)` to `createStore` in `src/store.js`: inside `exclusive`: find index → missing → `taskNotFound(id)`; `next = tasks.filter(t => t.id !== id)`; `await saveTasks(file, next)`; commit.
- [x] T033 [US3] Add route `DELETE /tasks/{id}` to `src/app.js`: `await store.remove(id)` → `sendNoContent(res)` (no body read required).
- [x] T034 [US3] Run `node --test tests/update.test.js tests/delete.test.js`; if any AC-20 – AC-27 case fails, fix `validatePatch` in `src/tasks.js` or `update` in `src/store.js` (never the test).

**Checkpoint**: AC-20 – AC-27 and AC-36 – AC-37 pass; earlier stories still pass.

---

## Phase 6: User Story 5 - Tasks survive a restart (Priority: P1)

**Goal**: Prove with real processes that data survives restarts, rejected requests never touch the file, corrupt files block startup, and 20 simultaneous creates are all kept. The atomic save and lock already exist (T009); this story adds graceful shutdown and the end-to-end tests.

**Independent Test**: Create/update/delete tasks against a child process, restart it on the same `DATA_FILE`, compare lists (AC-45 – AC-49, AC-54). Depends on US1–US3 routes (AC-46 needs DELETE; AC-48 uses AC-19/22/26/31/37 requests).

### Tests for User Story 5 (write first, confirm they fail) ⚠️

- [x] T035 [P] [US5] Create `tests/persistence.test.js` using `startProcess` / `runProcessToExit` from `tests/helpers/server.js`: AC-45 (create 3 tasks, PATCH one with new title, priority, tags, and status `in-progress`; take `GET /tasks`; `stop()`; start a new process on the same file; `GET /tasks` → 200 and `deepEqual` to the earlier body); AC-46 (create 2, delete one, restart, `GET /tasks/{deleted id}` → 404 `TASK_NOT_FOUND`); AC-47 (process with a non-existent `DATA_FILE` path in a temp dir → `GET /tasks` 200 `[]`, and the file still does not exist); AC-48 (in-process `startServer`: seed tasks, then for each rejected request — AC-04 `POST {"title":""}`, AC-19 `GET /tasks/does-not-exist`, AC-22 `PATCH {"title":""}`, AC-26 `PATCH /tasks/does-not-exist`, AC-31 `todo → done`, AC-37 `DELETE /tasks/does-not-exist` — read the data file as a `Buffer` before and after and `assert.deepEqual` them); AC-49 (write `not json` to the data file, `runProcessToExit` → `code !== 0`, stderr contains `Failed to start`, file content still exactly `not json`); *(rev 1.3)* AC-62 (`runProcessToExit({ dataFile: <non-existent path in temp dir>, env: { PORT: 'abc' } })` → `code !== 0`, stderr has a line starting with `Failed to start`, and the data file still does not exist).
- [x] T036 [P] [US5] Create `tests/concurrency.test.js`: AC-54 — start a child process on an empty temp file; build 20 `fetch` POST promises for titles `T1` … `T20` with no `await` between them, then `Promise.all`; assert all 20 statuses are 201; `GET /tasks` → 200 with exactly 20 tasks, 20 distinct ids, and the set of titles equals `{T1 … T20}`; read the data file and `JSON.parse` it (valid array of 20); `stop()`, restart on the same file, `GET /tasks` → `deepEqual` to the pre-restart list. Also assert no `*.tmp` files remain in the temp dir.

### Implementation for User Story 5

- [x] T037 [US5] Add graceful shutdown to `src/index.js` (contracts/runtime-config.md): on `SIGINT` and `SIGTERM`, call `server.close()`, `await store.idle()` so queued saves finish, then set `process.exitCode = 0` and let the process exit (register the handlers once, after listening).
- [x] T038 [US5] Run `node --test tests/persistence.test.js tests/concurrency.test.js`; fix any failure in `src/store.js` / `src/index.js` (e.g. Windows `EPERM` on rename → check the retry in `saveTasks`; startup exit code → check `process.exitCode = 1` path). Never weaken a test.

**Checkpoint**: AC-45 – AC-49, AC-54 and AC-62 pass on Windows; no leftover `*.tmp` files.

---

## Phase 7: User Story 4 - Find tasks by tag and see the most important first (Priority: P2)

**Goal**: `GET /tasks?tag=…&sort=priority` with case-insensitive tag filter and stable priority sort.

**Independent Test**: Create tasks with mixed tags/priorities, request filtered and sorted lists, compare order (AC-38 – AC-44).

### Tests for User Story 4 (write first, confirm they fail) ⚠️

- [x] T039 [P] [US4] Create `tests/filter-sort.test.js`: AC-38 (T1 `["home"]`, T2 `["work"]`, T3 `["home","urgent"]` created in order → `?tag=home` → 200, titles exactly `[T1, T3]`); AC-39 (`?tag=garden` → 200 `[]`); AC-40 (`?tag=Home` → `[T1, T3]`); AC-41 (`?tag=` → 400 `VALIDATION_ERROR`); AC-42 (L1 low, H1 high, M1 medium, H2 high, L2 low → `?sort=priority` → titles H1, H2, M1, L1, L2, and a following plain `GET /tasks` is still in creation order); AC-43 (`?sort=name` → 400 `VALIDATION_ERROR`); AC-44 (A low `["home"]`, B high `["work"]`, C high `["home"]`, D medium `["home"]` → `?tag=home&sort=priority` → C, D, A); *(rev 1.3)* AC-58 (`?foo=1`, `?tag=home&tag=work`, `?sort=priority&sort=priority` → 400 `VALIDATION_ERROR` each); AC-61 (on an empty store, `?tag=` + `'a'.repeat(51)` → 400 `VALIDATION_ERROR`; `?tag=` + `'a'.repeat(50)` → 200 `[]`).

### Implementation for User Story 4

- [x] T040 [US4] Add to `src/tasks.js`: `parseListQuery(searchParams)` (research R10) — only keys `tag` and `sort` allowed (any other key → 400); each at most once (`searchParams.getAll(k).length > 1` → 400); if `tag` present, trim + lowercase, empty or more than 50 code points after trim → 400 `VALIDATION_ERROR` (same limit as stored tags, FR-013 rev 1.3); if `sort` present it must equal `priority` else 400; returns `{ tag: string|undefined, sort: 'priority'|undefined }`. `filterByTag(list, tag)` → `list.filter(t => t.tags.includes(tag))`. `sortByPriority(list)` → sorts a **copy** with rank `{ high: 0, medium: 1, low: 2 }` using stable `Array.prototype.sort`.
- [x] T041 [US4] Update the `GET /tasks` route in `src/app.js`: `const q = parseListQuery(url.searchParams)`; `let result = store.list()`; if `q.tag` → `filterByTag`; then if `q.sort` → `sortByPriority` (filter before sort); `sendJson(res, 200, result)`. Query strings on other routes are rejected by the T010 router check (FR-026); do not add query handling to them.
- [x] T042 [P] [US4] Extend `tests/tasks.unit.test.js`: `parseListQuery` rejects unknown key `foo`, repeated `tag`, `tag=%20`, `sort=name`, and a 51-character tag, and accepts a 50-character tag; `sortByPriority` does not mutate its input and keeps ties in input order.

**Checkpoint**: AC-38 – AC-44 pass; all earlier ACs still pass.

---

## Phase 8: Cross-Cutting Acceptance Criteria (AC-50 – AC-53, AC-55 – AC-57, AC-59, AC-60, AC-63)

**Purpose**: General HTTP behaviour across all routes (unknown routes, response shape, body size limit, check order, query and ID checks, server failure, empty body).

- [x] T043 Create `tests/general.test.js`: AC-50 (`GET /unknown` and `PUT /tasks` → 404 `ROUTE_NOT_FOUND`); AC-51 (send one representative request from each AC group AC-04 – AC-63 (rev 1.4 range) — create error, read 404, update 400, status 409, delete 404, filter 400, route 404, plus successful 200/201 — and assert `content-type` is exactly `application/json`, error bodies have exactly keys `error` and `message`, both non-empty strings, `message` has no `\n    at ` and no `/src/` or `\src\`); AC-52 (raw body `'a'.repeat(102401)` to `POST /tasks` → 400 `VALIDATION_ERROR`, `GET /tasks` count unchanged; same body to `PATCH /tasks/{existing id}` → 400 `VALIDATION_ERROR`; the response is received, not `ECONNRESET`); AC-53 (`PATCH /tasks/does-not-exist` `{"title":""}` → 404 `TASK_NOT_FOUND`; `PATCH /tasks/does-not-exist` raw `{"title":` → 400 `INVALID_JSON`). The AC-51 sample above is a smoke check; full AC-51 coverage comes from the global helper rule, which applies to every test file. *(Rev 1.3 additions)* AC-55 (with one existing task: `POST /tasks?x=1` `{"title":"A"}`, `GET /tasks/{id}?x=1`, `PATCH /tasks/{id}?x=1` `{"title":"B"}`, `DELETE /tasks/{id}?x=1` → 400 `VALIDATION_ERROR` each; then `GET /tasks` deep-equals the list from before); AC-56 (`GET`, `PATCH` `{"title":"A"}`, and `DELETE` on `/tasks/%E0%A4` → 400 `VALIDATION_ERROR` each, never 500); AC-57 (`startServer({ dataFile: <tmp>/blocked/tasks.json })` with `<tmp>/blocked` absent; then `fs.writeFile(<tmp>/blocked, '')`; `POST {"title":"A"}` → `assertError(res, 500, 'INTERNAL_ERROR')`; `GET /tasks` → 200 `[]`; `fs.rm(<tmp>/blocked)`; `POST {"title":"B"}` → 201; `GET /tasks` → exactly one task titled `B`); AC-59 (raw empty body `''` to `POST /tasks` and to `PATCH /tasks/{existing id}` → 400 `INVALID_JSON`; task count and task unchanged); AC-60 (`HEAD /tasks` → status 404; `OPTIONS /tasks` and `GET /tasks/` → 404 `ROUTE_NOT_FOUND`). *(Rev 1.4 addition)* AC-63 (`X = 'a'.repeat(101)`: `GET /tasks/X`, `PATCH /tasks/X` `{"title":"A"}`, `DELETE /tasks/X` → 400 `VALIDATION_ERROR` each; `Y = 'a'.repeat(100)`: `GET /tasks/Y` → 404 `TASK_NOT_FOUND`).
- [x] T044 Run `node --test tests/general.test.js`; fix any failure in `src/http.js` (drain logic, exact header) or `src/app.js` (route table, error mapping). Never change the test.

---

## Phase 9: Polish & Quality Gates

**Purpose**: Run every constitution gate from quickstart.md and the plan.

- [x] T045 [P] Lint gate: run `npx eslint .` → exit code 0, 0 errors; confirm no `eslint-disable` anywhere (`grep -rn "eslint-disable" src tests eslint.config.js` → no matches).
- [x] T046 [P] Test integrity gate: `node --test` → exit 0, all pass, 0 skipped/todo; `grep -rnE "\.(skip|todo|only)\(|\{ *(skip|todo|only) *:" tests` → no matches.
- [x] T047 [P] Traceability gate: `grep -rhoE "AC-[0-9]{2}" tests | sort -u | wc -l` → `63`; confirm every AC from AC-01 to AC-63 appears at the start of at least one `test(` name.
- [x] T048 [P] Secret and dependency gate: `grep -rniE "(api[_-]?key|token|password|secret)\s*[:=]" src tests` → no matches; `grep -rhoE "from '[^']+'" src | sort -u` lists only `node:http`, `node:fs`, `node:fs/promises`, `node:path`, `node:crypto`, and relative `./` imports; `package.json` has only `eslint` in `devDependencies` and no `dependencies`.
- [x] T049 Performance check (SC-005): write a temp data file with 1,000 valid tasks, start `PORT=0 DATA_FILE=<temp> node src/index.js`, and time `GET /tasks`, `GET /tasks?tag=x&sort=priority`, one `POST`, one `PATCH`, one `DELETE` — each must complete in < 1 s. Record the result in the PR description; do not add it to the test suite.
- [x] T050 Run the 10 smoke scenarios and the concurrency check from `specs/001-todo-task-api/quickstart.md` against a fresh temp `DATA_FILE` (PowerShell form) and confirm every expected result; fix code (not docs) on any mismatch, or report a spec conflict to a human per Principle VI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately. T004 depends on T001–T003.
- **Foundational (Phase 2)**: depends on Setup. T005–T008 parallel; T009 needs T005 + T008; T010 needs T005, T007, T009; T011 needs T006, T009, T010; T012–T015 and T051 parallel once their target modules exist (T012 needs T009–T011; T051 needs T006). **Blocks all stories.**
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1 (needs `POST /tasks` to create tasks to transition).
- **US3 (Phase 5)**: after US2 (field edits reuse the `PATCH` route and `validatePatch` from US2).
- **US5 (Phase 6)**: after US3 — AC-46 needs `DELETE`, AC-48 replays AC-19/22/26/31/37. Persistence itself has worked since Phase 2, so data already survives restarts from US1 onward.
- **US4 (Phase 7)**: after US1 only (needs `POST` + `GET /tasks`); can run in parallel with US2/US3/US5 if different people own `src/tasks.js` sections carefully (same files → coordinate).
- **Cross-cutting (Phase 8)**: after US1–US3 (AC-52/53 need `PATCH`).
- **Polish (Phase 9)**: after all phases.

### User Story Dependencies

- **US1 (P1)**: Foundational only.
- **US2 (P1)**: US1 (create).
- **US3 (P2)**: US1 + US2 (`PATCH` route).
- **US5 (P1)**: US1 + US2 + US3 (routes used by its tests).
- **US4 (P2)**: US1.

### Within Each User Story

- Tests first; confirm they fail (routes 404 / assertions fail).
- `src/tasks.js` pure functions → `src/store.js` operations → `src/app.js` routes.
- Story checkpoint passes before moving on.

### Parallel Opportunities

- Phase 1: T002, T003.
- Phase 2: T005, T006, T007, T008 together; then T012–T015 and T051 together.
- Each story: the test-file task(s) marked [P] can be written while another person writes the `src/tasks.js` function; unit-test extensions marked [P].
- US4 (Phase 7) can proceed alongside US2/US3 after US1, but it edits `src/tasks.js` and `src/app.js` too — merge carefully.
- Phase 9: T045–T048 together.

---

## Parallel Example: Foundational

```text
Task: "T005 Create src/errors.js (ApiError, ERROR_CODES, DataFileError)"
Task: "T006 Create src/config.js (PORT, HOST, DATA_FILE)"
Task: "T007 Create src/http.js (readBody 100 KB with drain, parseJson, sendJson, sendError)"
Task: "T008 Create src/tasks.js field validators"
```

## Parallel Example: User Story 1

```text
Task: "T016 [US1] tests/create.test.js AC-01 – AC-16"
Task: "T017 [US1] tests/read.test.js AC-17 – AC-19"
# then sequentially: T018 → T019 → T020 → T021 → T022
```

## Parallel Example: User Story 5

```text
Task: "T035 [US5] tests/persistence.test.js AC-45 – AC-49"
Task: "T036 [US5] tests/concurrency.test.js AC-54"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 US1 → STOP and validate: `node --test tests/create.test.js tests/read.test.js` passes; create + list works and persists to `data/tasks.json` via `npm start`.

### Incremental Delivery

1. Setup + Foundational → server boots, atomic store ready.
2. US1 → create/view (MVP).
3. US2 → status lifecycle.
4. US3 → edit and delete.
5. US5 → restart, rejection-safety, corrupt-file, and concurrency proof.
6. US4 → tag filter and priority sort.
7. Cross-cutting ACs → Polish gates → all 63 ACs green, lint 0 errors.

### Notes

- [P] = different files, no dependency on unfinished tasks.
- Commit after each task or logical group.
- If any gate cannot pass without breaking a constitution principle, stop and escalate to a human.
- A requirement change goes into spec.md (with a Revision History entry) before code or tests change.
