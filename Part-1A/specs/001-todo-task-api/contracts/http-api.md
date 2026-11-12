# HTTP API Contract: Todo Task REST API

**Feature**: `001-todo-task-api` | **Version**: 1.2 (matches spec v1.4) | **Date**: 2026-11-10

*Contract 1.2 (2026-11-10): updated in place for spec rev 1.4. The task ID in the path must be
1–100 characters after decoding; a longer ID → 400 `VALIDATION_ERROR` (FR-027, AC-63). Nothing was
removed.*

*Contract 1.1 (2026-11-10): updated in place for spec rev 1.3. Adds FR-026 (no query parameters
except on `GET /tasks`), FR-027 (badly encoded task ID → 400), the 50-character `tag` filter
limit, empty body → `INVALID_JSON`, and the full FR-019 check order. Nothing was removed.*

Base URL: `http://{HOST}:{PORT}` (default `http://127.0.0.1:3000`). See
[runtime-config.md](runtime-config.md).

## Conventions

- Request bodies are JSON, at most **102,400 bytes**. The request `Content-Type` header is not
  checked.
- An empty request body on `POST` or `PATCH` is not valid JSON → 400 `INVALID_JSON` (AC-59).
- **Query parameters**: only `GET /tasks` accepts them. Any query parameter on another route
  (for example `DELETE /tasks/{id}?x=1`) → 400 `VALIDATION_ERROR`, checked before the body is
  read, and nothing changes (FR-026, AC-55).
- **Task ID in the path**: `{id}` is URL-decoded. If it is not valid percent-encoding (for example
  `/tasks/%E0%A4`) → 400 `VALIDATION_ERROR`, never 500 (FR-027, AC-56). After decoding it must be
  1–100 characters; a longer ID → 400 `VALIDATION_ERROR` before any lookup. An ID of 100
  characters or fewer that matches no task → 404 `TASK_NOT_FOUND` (FR-027, AC-63).
- **Check order** for every route (FR-019): route not found (404) → query parameter / ID encoding / ID
  length (400) → body > 102,400 bytes (400) → invalid JSON (400) → task not found (404) → field
  validation (400) → status transition (409).
- Every response with a body sends exactly `Content-Type: application/json`.
- `Task` is the object defined in [data-model.md](../data-model.md):

  ```json
  { "id": "string", "title": "string", "status": "todo|in-progress|done",
    "priority": "low|medium|high", "tags": ["string"], "createdAt": "ISO-8601 UTC" }
  ```

- `Error` is always exactly:

  ```json
  { "error": "<ERROR_CODE>", "message": "<non-empty human-readable text>" }
  ```

  `message` never contains stack traces or file paths.

## Routes

Any method/path pair not listed here (for example `PUT /tasks`, `GET /unknown`, `/tasks/`,
`HEAD`, `OPTIONS`) → **404** `ROUTE_NOT_FOUND` (AC-50, AC-60). A `HEAD` reply has no body.

### `POST /tasks` — create

| Body field | Required | Type / values | Default |
|------------|----------|---------------|---------|
| `title` | yes | string, 1–200 chars after trim | — |
| `priority` | no | `low` \| `medium` \| `high` | `medium` |
| `tags` | no | array (≤20) of strings, 1–50 chars after trim | `[]` |
| `status` | no | `todo` only | `todo` |

Any other key (including `id` and `createdAt`) → 400.

| Result | Status | Body |
|--------|--------|------|
| Created | **201** | `Task` |
| Any query parameter | 400 | `VALIDATION_ERROR` |
| Body > 100 KB | 400 | `VALIDATION_ERROR` |
| Empty body or malformed JSON | 400 | `INVALID_JSON` |
| Not an object, missing or invalid field, unknown/read-only key, `status` ≠ `todo` | 400 | `VALIDATION_ERROR` |

### `GET /tasks` — list

| Query | Rule |
|-------|------|
| `tag` | optional, at most once; trimmed and lowercased; empty or more than 50 characters after trim → 400 (AC-41, AC-61) |
| `sort` | optional, at most once; only `priority` (high → medium → low, stable) |
| other key, or `tag` / `sort` repeated | → 400 (AC-58) |

| Result | Status | Body |
|--------|--------|------|
| OK | **200** | `Task[]` in creation order, filtered then sorted; `[]` if none match |
| Bad query parameter | 400 | `VALIDATION_ERROR` |

### `GET /tasks/{id}` — get one

| Result | Status | Body |
|--------|--------|------|
| Found | **200** | `Task` |
| Any query parameter, or `{id}` not valid percent-encoding or longer than 100 characters | 400 | `VALIDATION_ERROR` |
| Unknown id | 404 | `TASK_NOT_FOUND` |

### `PATCH /tasks/{id}` — partial update

Body: a non-empty object with any of `title`, `priority`, `tags`, `status` (same rules as create,
except `status` may be any of the three values). `tags` replaces the whole array.

Checks run in this order; the first failure is returned (FR-019):

| # | Check | Status | `error` |
|---|-------|--------|---------|
| 0a | Any query parameter (FR-026) | 400 | `VALIDATION_ERROR` |
| 0b | `{id}` not valid percent-encoding, or longer than 100 characters after decoding (FR-027) | 400 | `VALIDATION_ERROR` |
| 1 | Body > 102,400 bytes | 400 | `VALIDATION_ERROR` |
| 2 | Body is empty or not valid JSON | 400 | `INVALID_JSON` |
| 3 | Task id does not exist | 404 | `TASK_NOT_FOUND` |
| 4 | Not an object / `{}` / unknown or read-only key / invalid value | 400 | `VALIDATION_ERROR` |
| 5 | `status` present and change not allowed (including same value) | 409 | `INVALID_STATUS_TRANSITION` |
| — | All checks pass | **200** | updated `Task` |

On any failure nothing changes (all-or-nothing).

### `DELETE /tasks/{id}` — delete

| Result | Status | Body |
|--------|--------|------|
| Deleted | **204** | *(empty, no Content-Type)* |
| Any query parameter, or `{id}` not valid percent-encoding or longer than 100 characters | 400 | `VALIDATION_ERROR` |
| Unknown id (including already deleted) | 404 | `TASK_NOT_FOUND` |

## Error codes

| `error` | Status | Meaning |
|---------|--------|---------|
| `INVALID_JSON` | 400 | Body is empty or could not be parsed as JSON |
| `VALIDATION_ERROR` | 400 | Bad field, bad query parameter, query parameter on a route that has none, badly encoded or too long (over 100 characters) task id, or body too large |
| `TASK_NOT_FOUND` | 404 | No task with this id |
| `ROUTE_NOT_FOUND` | 404 | Method/path pair not supported |
| `INVALID_STATUS_TRANSITION` | 409 | Status change not allowed by the lifecycle |
| `INTERNAL_ERROR` | 500 | Unexpected server fault only (for example disk write failed); generic message, no stack trace or path; nothing changes and later requests still work (spec v1.2, FR-017; tested by AC-57) |

## Guarantees

- A 2xx reply to a change is sent only **after** the change is saved to the data file.
- Changes received at the same time are applied one at a time; none is lost (FR-025).
- A rejected request (4xx/5xx) never changes the data file (AC-48).
