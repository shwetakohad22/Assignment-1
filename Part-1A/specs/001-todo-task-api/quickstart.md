# Quickstart & Validation Guide: Todo Task REST API

**Feature**: `001-todo-task-api` | **Date**: 2026-11-10

This guide shows how to install, run, and check the feature from start to finish. API details are
in [contracts/http-api.md](contracts/http-api.md). Configuration is in
[contracts/runtime-config.md](contracts/runtime-config.md).

## Prerequisites

- Node.js **22 or newer** (`node --version`).
- npm (only needed to install ESLint).

## Setup

```bash
npm install          # installs eslint (the only dev dependency)
```

## Quality gates (all must pass)

| Gate | Command | Expected |
|------|---------|----------|
| Lint | `npx eslint .` | exit code 0, 0 errors |
| Tests | `node --test` (or `npm test`) | exit code 0, all tests pass, 0 skipped/todo |
| Traceability | `grep -rhoE "AC-[0-9]{2}" tests \| sort -u \| wc -l` | `63` (AC-01 – AC-63, spec v1.4) |
| Secrets | `grep -rniE "(api[_-]?key\|token\|password\|secret)\s*[:=]" src tests` | no matches |

Tests always use a temp data file. They never touch `data/tasks.json`.

## Run manually

```bash
npm start                                   # http://127.0.0.1:3000, data/tasks.json
PORT=4000 DATA_FILE=./tmp/demo.json npm start   # bash
$env:PORT=4000; $env:DATA_FILE="./tmp/demo.json"; npm start   # PowerShell
```

## Smoke scenarios

Run these against a fresh `DATA_FILE`. `$B` is the base URL, for example `http://127.0.0.1:3000`.

| # | Request | Expected | ACs |
|---|---------|----------|-----|
| 1 | `curl -i -X POST $B/tasks -d '{"title":"Buy milk"}'` | 201; `status` `todo`, `priority` `medium`, `tags` `[]` | AC-01 |
| 2 | `curl -i -X POST $B/tasks -d '{"title":"Clean","priority":"high","tags":["Home","urgent","home"]}'` | 201; `tags` `["home","urgent"]` | AC-02 |
| 3 | `curl -i "$B/tasks?tag=Home&sort=priority"` | 200; only "Clean" | AC-40, AC-44 |
| 4 | `curl -i -X PATCH $B/tasks/<id1> -d '{"status":"done"}'` | 409 `INVALID_STATUS_TRANSITION` | AC-31 |
| 5 | `curl -i -X PATCH $B/tasks/<id1> -d '{"status":"in-progress"}'` | 200 | AC-28 |
| 6 | `curl -i -X PATCH $B/tasks/nope -d '{"title":""}'` | 404 `TASK_NOT_FOUND` | AC-53 |
| 7 | `curl -i -X POST $B/tasks -d '{"title":'` | 400 `INVALID_JSON` | AC-12 |
| 8 | `curl -i -X PUT $B/tasks` | 404 `ROUTE_NOT_FOUND` | AC-50 |
| 9 | Stop the server (Ctrl+C), start it again with the same `DATA_FILE`, `curl $B/tasks` | Same list as before the stop | AC-45 |
| 10 | Write `not json` to the data file, then `npm start` | Exits with a non-zero code; file still says `not json` | AC-49 |

## Concurrency check (AC-54)

Bash, against a fresh data file:

```bash
for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/tasks -d "{\"title\":\"T$i\"}" & done; wait
curl -s $B/tasks | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a.length,new Set(a.map(t=>t.id)).size)})"
```

Expected: twenty lines of `201`, then `20 20`. After a restart, the count is still `20 20`.
The automated version is in `tests/concurrency.test.js`.
