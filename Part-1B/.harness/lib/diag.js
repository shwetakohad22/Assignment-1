// Parses the agent's AGENT_DIAG stderr line, keeping only the allow-listed fields.

const PREFIX = 'AGENT_DIAG ';
const ALLOWED = Object.freeze(['attempts', 'failure_kind', 'http_status', 'model']);

export function parseDiag(stderrText) {
  const lines = String(stderrText ?? '')
    .split(/\r?\n/)
    .filter((l) => l.startsWith(PREFIX));
  if (lines.length === 0) return null;
  let value;
  try {
    value = JSON.parse(lines[lines.length - 1].slice(PREFIX.length));
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const k of ALLOWED) out[k] = Object.prototype.hasOwnProperty.call(value, k) ? value[k] : null;
  return out;
}
