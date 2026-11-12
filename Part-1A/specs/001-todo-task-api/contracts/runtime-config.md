# Runtime Contract: Configuration, Startup, Shutdown

**Feature**: `001-todo-task-api` | **Date**: 2026-11-10

## Entry point

```text
node src/index.js        # also: npm start
```

## Environment variables

| Variable | Default | Accepted values | Invalid value |
|----------|---------|-----------------|---------------|
| `PORT` | `3000` | Integer `0`–`65535` (`0` = any free port) | Exit code 1, message on stderr |
| `HOST` | `127.0.0.1` | Any non-empty host or IP string | Exit code 1 |
| `DATA_FILE` | `<project>/data/tasks.json` | Any non-empty path; relative paths are resolved from the current directory | Exit code 1 |

*(Spec rev 1.3)* These rules are now required by FR-023. An invalid value means the service does
not start, writes `Failed to start: <reason>` to stderr, exits with code 1, and writes nothing to
the data file (AC-62).

None of these values are secret (constitution Principle II). Do not commit `.env` files. Use
`node --env-file=.env src/index.js` if you want to load them from a file.

## Startup

| Condition | Outcome |
|-----------|---------|
| `DATA_FILE` missing | Starts with an empty list; the file is created on the first change |
| `DATA_FILE` is a valid task list | Starts with those tasks, in file order |
| `DATA_FILE` is not valid JSON, not an array, has an invalid task or duplicate id, or is empty | **Does not start**: writes `Failed to start: <reason>` to stderr, exits with **code 1**, and leaves the file unchanged |
| Port in use / cannot listen | Exits with code 1 |
| Ready | Writes exactly one line to stdout: `Listening on http://<host>:<port>` (the real port, also when `PORT=0`) |

## Shutdown

- On `SIGINT` / `SIGTERM`: stop accepting connections, wait for queued saves to finish, exit
  with code 0.
- A hard kill (for example `child.kill()` on Windows) loses no data: every acknowledged change was
  already saved, and the temp-file + rename save means the data file is never half-written.
- A leftover `*.tmp` file next to the data file (from a crash during a save) is ignored at
  startup and is safe to delete.
