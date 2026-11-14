// Layer 3: CHK-SEM-TASK and CHK-SEM-TIME (FR-26 to FR-29). Deterministic; no LLM judge.

const IST_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/;

export function normalise(s) {
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

function entryMatches(entry, paddedTask) {
  const options = Array.isArray(entry) ? entry : [entry];
  return options.some((k) => {
    const nk = normalise(k);
    return nk !== '' && paddedTask.includes(' ' + nk + ' ');
  });
}

export function taskScore(task, taskKeywords) {
  if (taskKeywords === null) return task === null ? 0.5 : 0;
  if (typeof task !== 'string') return 0;
  const padded = ' ' + normalise(task) + ' ';
  return taskKeywords.every((entry) => entryMatches(entry, padded)) ? 0.5 : 0;
}

export function timeScore(output, expected) {
  if (expected.datetime !== null) {
    const dt = output.datetime;
    if (typeof dt !== 'string' || !IST_RE.test(dt)) return 0;
    const a = Date.parse(dt);
    const b = Date.parse(expected.datetime);
    return Number.isFinite(a) && a === b ? 0.5 : 0;
  }
  if (expected.snooze_minutes !== null) {
    return output.snooze_minutes === expected.snooze_minutes ? 0.5 : 0;
  }
  return output.datetime === null && output.snooze_minutes === null ? 0.5 : 0;
}

export function semanticScore(output, expected) {
  return taskScore(output.task ?? null, expected.task_keywords) + timeScore(output, expected);
}
