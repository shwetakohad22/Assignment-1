# Contract: Agent CLI (`src/cli.js`)

## Invocation

```text
node --env-file=.env src/cli.js [--reference-time <ISO 8601 with offset>] [--timezone Asia/Kolkata]  < message.txt
```

- **stdin**: the whole message, UTF-8. Empty stdin = empty message.
- **--reference-time**: e.g. `2026-11-12T10:00:00+05:30` or `2026-11-12T04:30:00Z`. Missing →
  the current instant. No offset or invalid → `configuration_error`.
- **--timezone**: default `Asia/Kolkata`. Any other value → `configuration_error`.
- **Env**: `GEMINI_API_KEY` (required, loaded by Node's `--env-file`; code never reads `.env`),
  `GEMINI_MODEL` (optional; default `gemini-3.8-flash` per spec v1.2 FR-04).
- Unknown flags → `configuration_error`.

## stdout

Exactly one JSON object (schema 1.0, [output.schema.json](output.schema.json)) followed by `\n`.
Nothing else, ever.

## stderr

1. Optional human message, only for configuration errors. It names the problem, e.g.
   `GEMINI_API_KEY is not set` or `invalid --reference-time (offset required)`, and never prints a
   value of the key.
2. Exactly one final line: `AGENT_DIAG {"attempts":0,"failure_kind":null,"http_status":null,"model":"gemini-3.8-flash"}`.

stderr never contains the key, the request URL with parameters, headers, or the raw model text.

`failure_kind` is one of `network`, `timeout` (an aborted attempt or HTTP 408), `429`, `5xx`, or
`null` (spec v1.3 FR-36, FR-40).

## Exit codes (FR-07)

| Code | When |
|------|------|
| 0 | `status` ∈ {ok, needs_clarification, refused} |
| 1 | `status` = error, `reason` = invalid_model_output |
| 2 | `reason` = configuration_error (invalid flags, missing key, or any HTTP 4xx other than 408/429) |
| 3 | `reason` = model_service_failure (network, timeout, 408, 429 or 5xx after 3 attempts) |

## Library entry (for in-process tests)

`main({ argv, stdin, stdout, stderr, env, modelClient? }) → Promise<exitCode>`. `cli.js` passes
the real process objects. Tests pass fake streams, a plain env object and a fake model client.
