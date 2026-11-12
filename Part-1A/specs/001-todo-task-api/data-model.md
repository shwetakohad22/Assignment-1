# Data Model: Todo Task REST API

**Feature**: `001-todo-task-api` | **Date**: 2026-11-10 | **Plan**: [plan.md](plan.md)

## Entity: Task

| Field | Type | Set by | Changeable | Rules (FR) |
|-------|------|--------|------------|------------|
| `id` | string | system | never | `crypto.randomUUID()`; non-empty, unique (FR-002) |
| `title` | string | client | yes (`PATCH`) | Trimmed; 1–200 code points after trim; trimmed value stored (FR-004) |
| `status` | `"todo"` \| `"in-progress"` \| `"done"` | system on create; client on `PATCH` | only by allowed transition | Starts `todo`; on create only `"todo"` is accepted (FR-005, FR-008, FR-015) |
| `priority` | `"low"` \| `"medium"` \| `"high"` | client | yes | Default `"medium"` (FR-006) |
| `tags` | string[] | client | yes (whole array replaced) | Input array length 0–20; each item a string, 1–50 code points after trim; stored trimmed and lowercased; duplicates (after lowercasing) removed, first-seen order kept; default `[]` (FR-007) |
| `createdAt` | string | system | never | `new Date().toISOString()`, e.g. `2026-11-10T09:30:00.000Z` (FR-003) |

A task has **exactly** these six fields: no other field is stored or returned (FR-001). Tasks
have no links to other tasks and there are no user accounts.

### Normalization examples

| Input | Stored |
|-------|--------|
| `"title": "  Pay rent  "` | `"Pay rent"` |
| `"tags": ["Home", "urgent", "home"]` | `["home", "urgent"]` |
| `"tags": [" Work "]` | `["work"]` |
| `priority` omitted | `"medium"` |

## Input rules per operation

| Rule | Create (`POST /tasks`) | Update (`PATCH /tasks/{id}`) |
|------|------------------------|------------------------------|
| Body must be a JSON object (not `null`, array, or primitive) | yes | yes |
| Allowed keys | `title`, `priority`, `tags`, `status` | `title`, `priority`, `tags`, `status` |
| `id`, `createdAt`, or any other key present | 400 | 400 |
| `title` required | yes | no |
| At least one allowed key | n/a (title required) | yes (`{}` → 400) |
| `status` allowed values | `"todo"` only (others → 400) | any of the 3 values; then the transition check (409) |
| `status` not one of the 3 values | 400 | 400 (AC-27) |

A key whose value is `null` counts as a wrong type (400). It does not mean "use the default".

## State machine: `status`

```text
          ┌────────────── in-progress → todo ──────────────┐
          ▼                                                 │
       [todo] ── todo → in-progress ──▶ [in-progress] ── in-progress → done ──▶ [done]
```

| From \ To | `todo` | `in-progress` | `done` |
|-----------|--------|---------------|--------|
| `todo` | 409 | **200** | 409 |
| `in-progress` | **200** | 409 | **200** |
| `done` | 409 | 409 | 409 |

- Encoded as `ALLOWED_TRANSITIONS = { todo: ['in-progress'], 'in-progress': ['done', 'todo'], done: [] }`.
- Setting the current value again is **not** a transition and returns 409 (FR-015, AC-34).
- `done` is final.
- The transition check runs after all field validation, and inside the store lock against the
  latest saved status (see [research.md R6](research.md#r6-saves-happen-one-at-a-time-fr-025-ac-54)).
  If it fails, the whole PATCH is rejected, including any valid field changes in it (AC-35).

## Collection and ordering

- The store holds an **ordered array** of tasks. The array order is creation order (oldest first)
  and is kept in memory and in the data file.
- `GET /tasks`: the full array (FR-009).
- `?tag=x`: `x` is trimmed and lowercased; keep tasks where `tags.includes(x)` (FR-013).
- `?sort=priority`: stable sort by rank `high=0, medium=1, low=2`; equal ranks keep creation order
  (FR-014).
- Filter first, then sort, when both are given (AC-44).

## Persistence format (data file)

- One UTF-8 JSON file, by default `data/tasks.json`, or the path in `DATA_FILE`.
- Content: a JSON **array** of Task objects in creation order, pretty-printed with 2 spaces and a
  trailing newline:

  ```json
  [
    {
      "id": "3b1f0d1e-6a0a-4c1e-9f7a-2d1c9a6b8e11",
      "title": "Buy milk",
      "status": "todo",
      "priority": "medium",
      "tags": [],
      "createdAt": "2026-11-10T09:30:00.000Z"
    }
  ]
  ```

- **Write**: the whole array is written to a temp file in the same folder, fsynced, then renamed
  over the data file. Writes happen one at a time. See
  [research.md R5–R6](research.md#r5-atomic-save-temporary-file-then-rename).
- **Load at startup**:
  - File missing → empty list. The file is not created until the first change.
  - Not JSON, not an array, an item breaks a rule above, duplicate `id`, or empty file → startup
    fails with exit code 1 and the file is not touched (FR-022, AC-49).
