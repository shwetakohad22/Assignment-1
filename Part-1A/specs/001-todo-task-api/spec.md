# Feature Specification: Todo Task REST API

**Feature Branch**: `001-todo-task-api`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Build a Todo/Task REST API in Node.js. Each task has: id, title,
status, priority, tags, createdAt. Status values are todo, in-progress, done. Allowed status
changes: todo to in-progress, in-progress to done, in-progress back to todo. Anything else is
invalid. Priority values are low, medium, high. Features: create, list, get one, update and delete
tasks; filter the list by tag; sort the list by priority (high first); save all tasks in a JSON
file so they survive a restart. Write numbered acceptance criteria (AC-01, AC-02, and so on), each
one a binary pass/fail check with an exact expected HTTP status code and response. Cover normal
cases, missing or wrong input, not-found IDs, invalid status changes, tag filtering, priority
sorting, and persistence after restart. Add a Revision History section with a dated entry for this
first version."

## Clarifications

### Session 2026-11-10

- Q: If a client asks to change a task's status to the status it already has (e.g. `todo` →
  `todo`), should the API reject it with 409 or accept it and change nothing? → A: Reject with
  409 `INVALID_STATUS_TRANSITION`; nothing changes (FR-015, AC-34 unchanged).
- Q: What is the largest request body the API should accept before rejecting the request? → A:
  100 KB (102,400 bytes); larger bodies are rejected with 400 `VALIDATION_ERROR` (FR-024, AC-52).
- Q: When an update targets an unknown task ID and its body is also invalid, should the API
  return 400 or 404? → A: 404 first. Order: body too large (400) → malformed JSON (400) → task
  not found (404) → field validation (400) → status transition (409) (FR-019, AC-53).
- Q: If several change requests arrive at the same moment, must every one of them be saved with
  none lost or overwritten? → A: Yes; all concurrent changes MUST be saved, verified by 20
  simultaneous creates (FR-025, AC-54).
- Q: Should tags be matched ignoring upper/lower case, so filtering by `Home` finds tasks tagged
  `home`? → A: Yes; tags are stored in lowercase, duplicates are compared in lowercase, and the
  filter value is lowercased before matching (FR-007, FR-013, AC-02, AC-40).

## User Scenarios & Testing *(mandatory)*

The "user" of this feature is an API client (a script, front-end, or developer using an HTTP
tool) that manages a personal list of tasks. Every acceptance scenario below is defined precisely
by one or more numbered acceptance criteria in the [Acceptance Criteria](#acceptance-criteria)
section.

### User Story 1 - Create and view tasks (Priority: P1)

A client creates a task with a title (and optionally a priority and tags), then reads it back
individually or as part of the full list.

**Why this priority**: Without creating and reading tasks there is no product. This slice alone
is a usable MVP.

**Independent Test**: Start the service with an empty store, create tasks, and read them back by
ID and as a list.

**Acceptance Scenarios**:

1. **Given** an empty store, **When** a task is created with only a title, **Then** it is returned
   with a generated ID, status `todo`, priority `medium`, no tags, and a creation timestamp
   (AC-01).
2. **Given** a created task, **When** it is requested by ID, **Then** the same task is returned
   (AC-18).
3. **Given** a create request with a missing, empty, or wrongly typed field, **When** it is sent,
   **Then** it is rejected with 400 and nothing is stored (AC-04 – AC-16).
4. **Given** an ID that does not exist, **When** it is requested, **Then** 404 is returned (AC-19).

---

### User Story 2 - Move a task through its lifecycle (Priority: P1)

A client starts work on a task, finishes it, or puts it back on the to-do list. Only the allowed
transitions are accepted: `todo → in-progress`, `in-progress → done`, `in-progress → todo`.

**Why this priority**: Tracking progress is the core purpose of a task list, and the transition
rules protect data integrity.

**Independent Test**: Create a task and send each allowed and each disallowed status change;
check the status code and the stored status after each.

**Acceptance Scenarios**:

1. **Given** a task in `todo`, **When** its status is changed to `in-progress`, **Then** the change
   succeeds (AC-28).
2. **Given** a task in `todo`, **When** its status is changed directly to `done`, **Then** 409 is
   returned and the status stays `todo` (AC-31).
3. **Given** a task in `done`, **When** any status change is requested, **Then** 409 is returned
   (AC-32, AC-33).

---

### User Story 3 - Edit and delete tasks (Priority: P2)

A client corrects a task's title, priority, or tags, or removes a task it no longer needs.

**Why this priority**: Needed for day-to-day use, but the product still delivers value without it.

**Independent Test**: Create a task, update fields, delete it, and confirm the results via read
requests.

**Acceptance Scenarios**:

1. **Given** an existing task, **When** its title is updated, **Then** the new title is returned
   and stored, and `id` and `createdAt` are unchanged (AC-20).
2. **Given** an existing task, **When** it is deleted, **Then** 204 is returned and later reads
   return 404 (AC-36).
3. **Given** an unknown ID, **When** an update or delete is requested, **Then** 404 is returned
   (AC-26, AC-37).

---

### User Story 4 - Find tasks by tag and see the most important first (Priority: P2)

A client lists only tasks that have a given tag, and/or orders the list so `high` priority tasks
come first.

**Why this priority**: Makes a growing list manageable; depends on Story 1.

**Independent Test**: Create tasks with mixed tags and priorities, then request filtered and
sorted lists and compare against the expected order.

**Acceptance Scenarios**:

1. **Given** tasks with different tags, **When** the list is filtered by `home`, **Then** only
   tasks tagged `home` are returned (AC-38).
2. **Given** tasks with mixed priorities, **When** the list is sorted by priority, **Then** the
   order is high, medium, low, with ties kept in creation order (AC-42).

---

### User Story 5 - Tasks survive a restart (Priority: P1)

A client's tasks are still there, unchanged, after the service stops and starts again.

**Why this priority**: A task list that loses data is not trustworthy.

**Independent Test**: Create, update, and delete tasks; restart the service with the same data
file; compare the list before and after.

**Acceptance Scenarios**:

1. **Given** tasks were created and updated, **When** the service restarts, **Then** the list is
   identical to the list before the restart (AC-45).
2. **Given** a task was deleted, **When** the service restarts, **Then** it is still gone (AC-46).

---

### Edge Cases

- Title consisting only of spaces → rejected as empty (AC-05).
- Request body that is not valid JSON, or is valid JSON but not an object → 400 (AC-12, AC-13).
- Client tries to set `id`, `createdAt`, or an unknown field → 400 (AC-14, AC-25).
- Update with an empty body `{}` → 400 (AC-24).
- Changing status to the value it already has (e.g. `todo → todo`) → 409, because it is not one of
  the three allowed transitions (AC-34).
- Update that combines a valid field change with an invalid status change → whole request rejected
  with 409, nothing changed (AC-35).
- Duplicate tags in one request, including ones differing only in case (`Home`, `home`) → stored
  once in lowercase, first-seen order kept (AC-02).
- Tag filter with no matches → empty list, not 404 (AC-39).
- Tag filter ignores case: `?tag=Home` matches tasks tagged `home` (AC-40).
- Unknown sort key or empty tag filter → 400 (AC-41, AC-43).
- Data file does not exist at startup → service starts with an empty list (AC-47).
- Data file exists but is not valid task data → service refuses to start and does not overwrite
  the file (AC-49).
- Any rejected request (400/404/409) leaves the data file unchanged (AC-48).
- Unknown URL path → 404 with error body (AC-50).
- Request body larger than 100 KB → 400, nothing stored (AC-52).
- Update for an unknown ID with an invalid body → 404, because existence is checked before field
  validation; malformed JSON or an oversized body still gives 400 first (AC-53).
- Many change requests arriving at the same moment → all saved, none lost (AC-54).
- Query parameter on a route other than `GET /tasks` (e.g. `DELETE /tasks/{id}?x=1`) → 400,
  nothing changed (AC-55).
- Task ID in the URL with broken percent-encoding (e.g. `/tasks/%E0%A4`) → 400, not 500 (AC-56).
- Task ID in the URL longer than 100 characters → 400; 100 characters or fewer but unknown → 404
  (AC-63).
- The data file cannot be written (e.g. disk failure) → 500 `INTERNAL_ERROR` with a generic
  message, nothing changed, and later requests still work (AC-57).
- Unknown or repeated query key on `GET /tasks` → 400 (AC-58).
- Empty request body on `POST` / `PATCH` → 400 `INVALID_JSON` (AC-59).
- `HEAD`, `OPTIONS`, or a trailing slash (`/tasks/`) → 404 (AC-60).
- Tag filter value longer than 50 characters → 400 (AC-61).
- Invalid configuration (e.g. `PORT=abc`) → service refuses to start (AC-62).

## Requirements *(mandatory)*

### Functional Requirements

**Task data**

- **FR-001**: Each task MUST have exactly these fields: `id`, `title`, `status`, `priority`,
  `tags`, `createdAt`.
- **FR-002**: `id` MUST be generated by the system, unique across all tasks, a non-empty string,
  and never changed after creation.
- **FR-003**: `createdAt` MUST be set by the system at creation as an ISO 8601 UTC timestamp
  (e.g. `2026-11-10T09:30:00.000Z`) and never changed afterwards.
- **FR-004**: `title` MUST be a string of 1–200 characters after trimming leading and trailing
  whitespace; the trimmed value is stored.
- **FR-005**: `status` MUST be one of `todo`, `in-progress`, `done`. New tasks MUST start in `todo`.
- **FR-006**: `priority` MUST be one of `low`, `medium`, `high`; it defaults to `medium` when not
  supplied.
- **FR-007**: `tags` MUST be a list of 0–20 strings, each 1–50 characters after trimming; it
  defaults to an empty list. Each tag MUST be trimmed and converted to lowercase before it is
  stored. Tags that are equal after this conversion MUST be stored once, keeping first-seen order.

**Operations**

- **FR-008**: Clients MUST be able to create a task (`POST /tasks`) by supplying `title` and
  optionally `priority`, `tags`, and `status` (only the value `todo` is accepted on create).
- **FR-009**: Clients MUST be able to list all tasks (`GET /tasks`). Without sort options, tasks
  MUST be returned in creation order (oldest first).
- **FR-010**: Clients MUST be able to get one task by ID (`GET /tasks/{id}`).
- **FR-011**: Clients MUST be able to partially update a task (`PATCH /tasks/{id}`), changing any
  of `title`, `priority`, `tags`, `status`. `id` and `createdAt` MUST NOT be changeable.
- **FR-012**: Clients MUST be able to delete a task (`DELETE /tasks/{id}`).
- **FR-013**: Clients MUST be able to filter the list by one tag (`GET /tasks?tag={tag}`). The
  filter value MUST be trimmed and converted to lowercase, and only tasks whose `tags` contain
  that value are returned. A value that is empty or longer than 50 characters after trimming MUST
  be rejected with 400 `VALIDATION_ERROR` (same length rule as stored tags, FR-007). Only the query
  keys `tag` and `sort` are allowed on `GET /tasks`, each at most once; any other key or a repeated
  key MUST be rejected with 400 `VALIDATION_ERROR`.
- **FR-014**: Clients MUST be able to sort the list by priority (`GET /tasks?sort=priority`):
  `high`, then `medium`, then `low`; tasks with equal priority keep creation order. Filter and
  sort MAY be combined.

**Status lifecycle**

- **FR-015**: The only allowed status changes are `todo → in-progress`, `in-progress → done`, and
  `in-progress → todo`. Any other change, including setting the current value again, MUST be
  rejected with 409.

**Validation and errors**

- **FR-016**: Every request MUST be fully validated before any data is changed. A rejected
  request MUST NOT change any stored data (all-or-nothing).
- **FR-017**: Error responses MUST use these status codes and error codes:

  | Situation | HTTP status | `error` value |
  |-----------|-------------|---------------|
  | Body is empty or not valid JSON | 400 | `INVALID_JSON` |
  | Missing, wrongly typed, out-of-range, read-only, or unknown field; bad query parameter; query parameter on a route that has none (FR-026); badly encoded or too long (over 100 characters) task ID (FR-027); body larger than 100 KB | 400 | `VALIDATION_ERROR` |
  | Task ID does not exist | 404 | `TASK_NOT_FOUND` |
  | URL path/method combination not supported (including `HEAD`, `OPTIONS`, and a trailing slash such as `/tasks/`) | 404 | `ROUTE_NOT_FOUND` |
  | Status change not allowed | 409 | `INVALID_STATUS_TRANSITION` |
  | Unexpected server failure (e.g. the data file could not be written) | 500 | `INTERNAL_ERROR` |

  `INTERNAL_ERROR` is only for unexpected failures that no valid or invalid client input can
  cause, such as a failed disk write. A request that fails this way MUST NOT change any stored
  data (FR-016), and its `message` MUST be a generic text with no stack trace, file path, or
  other internal detail (FR-018).

- **FR-018**: Every error response MUST be a JSON object with exactly two string fields, `error`
  (from the table above) and `message` (human-readable, non-empty), and MUST NOT contain stack
  traces or file paths.
- **FR-019**: When a request has several problems, checks MUST be applied in this order and the
  first failure returned: route not found (404) → query parameter or task-ID encoding/length check (400,
  FR-026, FR-027) → body too large (400) → invalid JSON (400) → task not found (404) → field
  validation (400) → status transition (409).
- **FR-020**: Successful responses MUST use: 201 with the created task for create; 200 with the
  task for get and update; 200 with a JSON array of tasks for list; 204 with an empty body for
  delete. All JSON responses MUST have content type `application/json`.

**Persistence**

- **FR-021**: All tasks MUST be saved to a single JSON data file after every successful change, so
  that the full task list is identical after the service restarts.
- **FR-022**: If the data file does not exist at startup, the service MUST start with an empty
  list. If it exists but cannot be read as a valid task list, the service MUST refuse to start,
  report the problem, and leave the file unchanged.
- **FR-023**: The location of the data file and the listening port MUST be configurable without
  changing code (see constitution Principle II). If `PORT` is not an integer 0–65535, or
  `DATA_FILE` or `HOST` is set but empty, the service MUST refuse to start, exit with a non-zero
  code, report the problem on stderr, and write nothing to the data file.

**Limits**

- **FR-024**: The service MUST reject any request whose body is larger than 100 KB (102,400
  bytes) with 400 `VALIDATION_ERROR`, without storing anything. This size check MUST happen
  before the body is parsed as JSON, so an oversized body gets `VALIDATION_ERROR` even if it is
  not valid JSON.

**Concurrency**

- **FR-025**: When several change requests (create, update, delete) arrive at the same time, every
  successful one MUST be reflected in memory and in the data file; no change may be lost or
  overwritten by another, and the data file MUST always contain a complete, valid task list.

**Routing inputs**

- **FR-026**: Only `GET /tasks` accepts query parameters (`tag`, `sort`). A request to any other
  route that includes a query parameter MUST be rejected with 400 `VALIDATION_ERROR` and MUST NOT
  change any stored data.
- **FR-027**: The `{id}` path segment MUST be valid URL percent-encoding; otherwise the request
  MUST be rejected with 400 `VALIDATION_ERROR` (never 500 `INTERNAL_ERROR`). After decoding, the
  ID MUST be 1–100 characters long; a longer ID MUST be rejected with 400 `VALIDATION_ERROR`
  before any lookup. An ID of 1–100 characters that matches no task gives 404 `TASK_NOT_FOUND` as
  before.

### Key Entities

- **Task**: A unit of work. Attributes: `id` (system-generated, unique), `title` (short text),
  `status` (`todo` / `in-progress` / `done`), `priority` (`low` / `medium` / `high`), `tags`
  (list of short labels), `createdAt` (creation time). Tasks are independent; there are no
  relationships between tasks and no user accounts.

## Acceptance Criteria

Each criterion is a binary pass/fail check. Unless stated otherwise, "error body `X`" means the
response body is a JSON object `{ "error": "X", "message": "<non-empty string>" }` and nothing
stored has changed. "Unknown ID" means an ID that was never created, e.g. `does-not-exist`.

### Create — normal cases

- **AC-01**: `POST /tasks` with `{"title":"Buy milk"}` returns **201** and a task with a non-empty
  string `id`, `title` `"Buy milk"`, `status` `"todo"`, `priority` `"medium"`, `tags` `[]`, and a
  `createdAt` that is a valid ISO 8601 UTC timestamp.
- **AC-02**: `POST /tasks` with
  `{"title":"Clean","priority":"high","tags":["Home","urgent","home"]}` returns **201** with
  `priority` `"high"` and `tags` `["home","urgent"]` (lowercased, duplicate removed, order kept).
- **AC-03**: `POST /tasks` with `{"title":"  Pay rent  "}` returns **201** with `title`
  `"Pay rent"`; two created tasks never share the same `id`.

### Create — missing or wrong input

- **AC-04**: `POST /tasks` with `{"title":""}` returns **400** with error body `VALIDATION_ERROR`.
- **AC-05**: `POST /tasks` with `{"title":"   "}` returns **400** with error body
  `VALIDATION_ERROR`.
- **AC-06**: `POST /tasks` with `{}` (title missing) returns **400** with error body
  `VALIDATION_ERROR`.
- **AC-07**: `POST /tasks` with `{"title":123}` returns **400** with error body `VALIDATION_ERROR`.
- **AC-08**: `POST /tasks` with a 201-character title returns **400** with error body
  `VALIDATION_ERROR`; a 200-character title returns **201**.
- **AC-09**: `POST /tasks` with `{"title":"A","priority":"urgent"}` returns **400** with error body
  `VALIDATION_ERROR`.
- **AC-10**: `POST /tasks` with `{"title":"A","tags":"home"}` returns **400** with error body
  `VALIDATION_ERROR`.
- **AC-11**: `POST /tasks` with `tags` containing a non-string (`[1]`), an empty string (`[""]`),
  a 51-character string, or 21 tags returns **400** with error body `VALIDATION_ERROR` in each case.
- **AC-12**: `POST /tasks` with body `{"title":` (malformed JSON) returns **400** with error body
  `INVALID_JSON`.
- **AC-13**: `POST /tasks` with body `["Buy milk"]` or `null` returns **400** with error body
  `VALIDATION_ERROR`.
- **AC-14**: `POST /tasks` with `{"title":"A","id":"x"}`, `{"title":"A","createdAt":"2020-01-01T00:00:00Z"}`,
  or `{"title":"A","color":"red"}` returns **400** with error body `VALIDATION_ERROR` in each case.
- **AC-15**: `POST /tasks` with `{"title":"A","status":"done"}` returns **400** with error body
  `VALIDATION_ERROR`; with `{"title":"A","status":"todo"}` it returns **201**.
- **AC-16**: After any of the rejected requests in AC-04 – AC-15, `GET /tasks` returns the same
  number of tasks as before the request.

### Read

- **AC-17**: `GET /tasks` on an empty store returns **200** with body `[]`.
- **AC-18**: After creating tasks "A", "B", "C" in that order, `GET /tasks` returns **200** with an
  array of exactly 3 tasks with titles in the order A, B, C; `GET /tasks/{id of B}` returns
  **200** with a task equal to the one returned when B was created.
- **AC-19**: `GET /tasks/does-not-exist` returns **404** with error body `TASK_NOT_FOUND`.

### Update — normal cases

- **AC-20**: `PATCH /tasks/{id}` with `{"title":"New title"}` returns **200** with `title`
  `"New title"` and the same `id` and `createdAt` as before; a following `GET /tasks/{id}` returns
  `title` `"New title"`.
- **AC-21**: `PATCH /tasks/{id}` with `{"priority":"low","tags":["work"]}` returns **200** with
  `priority` `"low"` and `tags` `["work"]`; other fields are unchanged.

### Update — missing or wrong input, not found

- **AC-22**: `PATCH /tasks/{id}` with `{"title":""}` returns **400** with error body
  `VALIDATION_ERROR`, and `GET /tasks/{id}` still returns the old title.
- **AC-23**: `PATCH /tasks/{id}` with `{"priority":"urgent"}` returns **400** with error body
  `VALIDATION_ERROR`.
- **AC-24**: `PATCH /tasks/{id}` with `{}` returns **400** with error body `VALIDATION_ERROR`.
- **AC-25**: `PATCH /tasks/{id}` with `{"id":"x"}`, `{"createdAt":"2020-01-01T00:00:00Z"}`, or
  `{"color":"red"}` returns **400** with error body `VALIDATION_ERROR` in each case.
- **AC-26**: `PATCH /tasks/does-not-exist` with `{"title":"X"}` returns **404** with error body
  `TASK_NOT_FOUND`.
- **AC-27**: `PATCH /tasks/{id}` with `{"status":"archived"}` returns **400** with error body
  `VALIDATION_ERROR` (unknown value, not a transition).

### Status changes

- **AC-28**: For a task in `todo`, `PATCH` with `{"status":"in-progress"}` returns **200** with
  `status` `"in-progress"`.
- **AC-29**: For a task in `in-progress`, `PATCH` with `{"status":"done"}` returns **200** with
  `status` `"done"`.
- **AC-30**: For a task in `in-progress`, `PATCH` with `{"status":"todo"}` returns **200** with
  `status` `"todo"`.
- **AC-31**: For a task in `todo`, `PATCH` with `{"status":"done"}` returns **409** with error body
  `INVALID_STATUS_TRANSITION`, and `GET` shows `status` still `"todo"`.
- **AC-32**: For a task in `done`, `PATCH` with `{"status":"in-progress"}` returns **409** with
  error body `INVALID_STATUS_TRANSITION`.
- **AC-33**: For a task in `done`, `PATCH` with `{"status":"todo"}` returns **409** with error body
  `INVALID_STATUS_TRANSITION`.
- **AC-34**: For a task in `todo`, `PATCH` with `{"status":"todo"}` returns **409** with error body
  `INVALID_STATUS_TRANSITION`; the same applies to `in-progress → in-progress` and
  `done → done`.
- **AC-35**: For a task in `todo` titled "Old", `PATCH` with `{"title":"New","status":"done"}`
  returns **409** with error body `INVALID_STATUS_TRANSITION`, and `GET` shows `title` still
  `"Old"` and `status` still `"todo"`.

### Delete

- **AC-36**: `DELETE /tasks/{id}` for an existing task returns **204** with an empty body; a
  following `GET /tasks/{id}` returns **404** with error body `TASK_NOT_FOUND`, and the task is
  absent from `GET /tasks`.
- **AC-37**: `DELETE /tasks/does-not-exist` returns **404** with error body `TASK_NOT_FOUND`;
  deleting the same task a second time also returns **404**.

### Tag filtering

- **AC-38**: Given tasks T1 `["home"]`, T2 `["work"]`, T3 `["home","urgent"]` created in that
  order, `GET /tasks?tag=home` returns **200** with exactly `[T1, T3]` in that order.
- **AC-39**: With the same tasks, `GET /tasks?tag=garden` returns **200** with body `[]`.
- **AC-40**: With the same tasks, `GET /tasks?tag=Home` returns **200** with exactly `[T1, T3]`
  in that order (case-insensitive match).
- **AC-41**: `GET /tasks?tag=` (empty value) returns **400** with error body `VALIDATION_ERROR`.

### Priority sorting

- **AC-42**: Given tasks created in order L1 `low`, H1 `high`, M1 `medium`, H2 `high`, L2 `low`,
  `GET /tasks?sort=priority` returns **200** with titles in the order H1, H2, M1, L1, L2.
- **AC-43**: `GET /tasks?sort=name` returns **400** with error body `VALIDATION_ERROR`.
- **AC-44**: Given tasks A `low ["home"]`, B `high ["work"]`, C `high ["home"]`, D `medium
  ["home"]` created in that order, `GET /tasks?tag=home&sort=priority` returns **200** with titles
  in the order C, D, A.

### Persistence

- **AC-45**: After creating three tasks and updating one (title, priority, tags, and status), then
  stopping and starting the service with the same data file, `GET /tasks` returns **200** with a
  body deep-equal to the `GET /tasks` body taken just before the stop.
- **AC-46**: After deleting a task, then stopping and starting the service with the same data
  file, `GET /tasks/{deleted id}` returns **404** with error body `TASK_NOT_FOUND`.
- **AC-47**: Starting the service with a data-file path that does not exist, `GET /tasks` returns
  **200** with body `[]`.
- **AC-48**: For each rejected request in AC-04, AC-19, AC-22, AC-26, AC-31, and AC-37, the data
  file content is byte-for-byte identical before and after the request.
- **AC-49**: Starting the service when the data file contains `not json` fails to start (the
  process exits with a non-zero code), and the file still contains `not json` afterwards.

### General

- **AC-50**: `GET /unknown` and `PUT /tasks` each return **404** with error body
  `ROUTE_NOT_FOUND`.
- **AC-51**: Every response in AC-04 – AC-63 that has a body has content type `application/json`,
  and every error body contains exactly the keys `error` and `message`, both non-empty strings,
  with no stack trace or file path in `message`.
- **AC-52**: `POST /tasks` with a body of 102,401 bytes returns **400** with error body
  `VALIDATION_ERROR`, and `GET /tasks` returns the same number of tasks as before;
  `PATCH /tasks/{id}` with a body of 102,401 bytes also returns **400** with error body
  `VALIDATION_ERROR`.
- **AC-53**: `PATCH /tasks/does-not-exist` with `{"title":""}` returns **404** with error body
  `TASK_NOT_FOUND`; `PATCH /tasks/does-not-exist` with body `{"title":` (malformed JSON) returns
  **400** with error body `INVALID_JSON`.
- **AC-54**: Starting from an empty store, sending 20 `POST /tasks` requests at the same time
  (titles "T1" – "T20", without waiting for responses) yields 20 responses of **201**; `GET /tasks`
  then returns **200** with exactly 20 tasks with 20 distinct `id` values and titles T1 – T20 (in
  any order); after stopping and starting the service with the same data file, `GET /tasks`
  returns the same 20 tasks.
- **AC-55**: Given an existing task, `POST /tasks?x=1` with `{"title":"A"}`, `GET /tasks/{id}?x=1`,
  `PATCH /tasks/{id}?x=1` with `{"title":"B"}`, and `DELETE /tasks/{id}?x=1` each return **400**
  with error body `VALIDATION_ERROR`; afterwards `GET /tasks` returns the same tasks as before
  (no task "A" created, the existing task still exists with its original title).
- **AC-56**: `GET /tasks/%E0%A4`, `PATCH /tasks/%E0%A4` with `{"title":"A"}`, and
  `DELETE /tasks/%E0%A4` each return **400** with error body `VALIDATION_ERROR` (not 500).
- **AC-57**: Start the service with `DATA_FILE` = `<tmp>/blocked/tasks.json` where `<tmp>/blocked`
  does not exist (empty list), then create a regular file named `<tmp>/blocked`.
  `POST /tasks` with `{"title":"A"}` returns **500** with error body `INTERNAL_ERROR` whose
  `message` contains no stack trace or file path; `GET /tasks` returns **200** with body `[]`.
  After deleting the file `<tmp>/blocked`, `POST /tasks` with `{"title":"B"}` returns **201** and
  `GET /tasks` returns exactly one task, titled "B".
- **AC-58**: `GET /tasks?foo=1`, `GET /tasks?tag=home&tag=work`, and
  `GET /tasks?sort=priority&sort=priority` each return **400** with error body `VALIDATION_ERROR`.
- **AC-59**: `POST /tasks` and `PATCH /tasks/{id}` (existing task) with an empty body (0 bytes)
  each return **400** with error body `INVALID_JSON`, and nothing stored changes.
- **AC-60**: `HEAD /tasks`, `OPTIONS /tasks`, and `GET /tasks/` each return **404**;
  `OPTIONS /tasks` and `GET /tasks/` have error body `ROUTE_NOT_FOUND` (a `HEAD` response has no
  body, so only its status is checked).
- **AC-61**: `GET /tasks?tag=` followed by 51 `a` characters returns **400** with error body
  `VALIDATION_ERROR`; with exactly 50 `a` characters it returns **200** with body `[]` (empty store).
- **AC-62**: Starting the service with `PORT=abc` and a `DATA_FILE` path that does not exist
  fails to start (the process exits with a non-zero code), stderr contains a line starting with
  `Failed to start`, and the data file still does not exist afterwards.
- **AC-63**: `GET /tasks/{X}`, `PATCH /tasks/{X}` with `{"title":"A"}`, and `DELETE /tasks/{X}`,
  where `{X}` is 101 `a` characters, each return **400** with error body `VALIDATION_ERROR`;
  `GET /tasks/{Y}`, where `{Y}` is 100 `a` characters (no such task), returns **404** with error
  body `TASK_NOT_FOUND`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of acceptance criteria AC-01 – AC-63 pass in the automated test suite.
- **SC-002**: 0 tasks are lost or altered across a service restart or when changes arrive at the
  same time (AC-45, AC-46, AC-54).
- **SC-003**: 100% of invalid requests receive a specific, documented error code, and 0 of them
  change stored data (AC-16, AC-48).
- **SC-004**: A client can create a task and see it in the list in 2 requests, with no setup other
  than starting the service.
- **SC-005**: With up to 1,000 stored tasks, every request completes in under 1 second on a
  typical developer laptop.

## Assumptions

- Single-user, local service: no authentication, accounts, or multi-tenant separation in this
  version.
- The service runs as a single process with a single data file; running several service instances
  against the same file is out of scope. Concurrent requests to that one process are in scope
  (FR-025).
- No pagination: the list returns all matching tasks (expected size: under 1,000 tasks).
- Only one tag can be filtered at a time; only `priority` is a supported sort key.
- `PATCH` is the only update method; full replacement (`PUT`) is not supported (AC-50).
- Tasks have no due date, description, or `updatedAt` field in this version.
- Unknown routes and unsupported methods both return 404 `ROUTE_NOT_FOUND`, so the API uses only
  the 400 / 404 / 409 error classes required by the constitution.
- Tech constraints come from the constitution: built-in Node.js modules only, tests run with
  `node --test`, ESLint with zero errors.

## Revision History

| Version | Date | Author | Change | Affected ACs |
|---------|------|--------|--------|--------------|
| 1.0 | 2026-11-10 | Shweta-leadows | Initial specification: task model, CRUD, status lifecycle, tag filter, priority sort, JSON-file persistence. | AC-01 – AC-51 (all new) |
| 1.1 | 2026-11-10 | Shweta-leadows | Clarification session (see Clarifications): same-status change confirmed as 409; added 100 KB body limit (FR-024); check order changed so not-found (404) comes before field validation (FR-019); concurrent changes must all be saved (FR-025); tags lowercased and matched case-insensitively (FR-007, FR-013). | Changed: AC-02, AC-40. Added: AC-52, AC-53, AC-54 |
| 1.2 | 2026-11-10 | Shweta-leadows | Added a 500 `INTERNAL_ERROR` row to the FR-017 error table for unexpected failures only (e.g. a failed disk write); its message must not expose stack traces or file paths. Found during planning (research R12); recorded before implementation per constitution Principle VI. | None |
| 1.3 | 2026-11-10 | Shweta-leadows | Fixes from `/speckit-analyze` (all additive; no existing AC removed or weakened). (1) Query parameters on any route other than `GET /tasks` are rejected with 400 (new FR-026) to meet constitution Principle III. (2) A badly percent-encoded task ID returns 400 instead of 500 (new FR-027). (3) The 500 `INTERNAL_ERROR` path from rev 1.2 is now testable: a failed save changes nothing and later requests still work. (4) Behaviour decided during planning is now in the spec: unknown or repeated query keys on `GET /tasks` → 400 (FR-013), empty body → `INVALID_JSON`, `HEAD` / `OPTIONS` / trailing slash → 404 `ROUTE_NOT_FOUND` (FR-017). (5) Tag filter value limited to 1–50 characters (FR-013). (6) Invalid `PORT` / `HOST` / `DATA_FILE` makes the service refuse to start (FR-023). FR-019 check order now starts with the route and query/ID checks. SC-001 range extended to AC-62. | Added: AC-55 (FR-026), AC-56 (FR-027), AC-57 (FR-016/017/018), AC-58 (FR-013), AC-59 (FR-017), AC-60 (FR-017), AC-61 (FR-013), AC-62 (FR-023). Changed: none. |
| 1.4 | 2026-11-10 | Shweta-leadows | Fixes for `/speckit-analyze` findings N5 and N4 (additive only; no AC removed or weakened). (1) FR-027: the task ID in the URL must be 1–100 characters after decoding; a longer ID returns 400 `VALIDATION_ERROR` before any lookup, so every input now has a length limit as constitution Principle III requires (N5). Real IDs are 36-character UUIDs and every ID used in existing ACs is under 100 characters, so no existing result changes. (2) FR-017 table and FR-019 check order mention the ID length check. (3) AC-51 range widened from AC-04 – AC-50 to AC-04 – AC-63, so the content-type and error-shape check also covers the rev 1.3 and 1.4 ACs (N4). (4) New edge case for long IDs. (5) SC-001 range extended to AC-63. | Added: AC-63 (FR-027). Changed: AC-51 (range widened to AC-04 – AC-63; stricter, nothing removed). |
