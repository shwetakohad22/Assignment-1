// Gemini generateContent client: timeout, retry and failure classification (FR-36 to FR-38).
// The key is sent only in the x-goog-api-key header and never appears in any result or error.

const MAX_ATTEMPTS = 3;
const DEFAULT_WAITS = Object.freeze([2000, 5000]);
const MAX_WAIT_MS = 30000;
const SAFETY_FINISH = Object.freeze(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST']);

function retryAfterMs(headerValue, nowMs) {
  if (headerValue === null || headerValue === undefined) return null;
  const v = String(headerValue).trim();
  if (v === '') return null;
  let ms;
  if (/^\d+$/.test(v)) {
    ms = Number(v) * 1000;
  } else {
    const at = Date.parse(v);
    if (Number.isNaN(at)) return null;
    ms = at - nowMs;
  }
  return Math.min(MAX_WAIT_MS, Math.max(0, ms));
}

function extractReply(json) {
  const candidate = json && Array.isArray(json.candidates) ? json.candidates[0] : undefined;
  const safetyBlocked = Boolean(
    (json && json.promptFeedback && json.promptFeedback.blockReason) ||
      (candidate && SAFETY_FINISH.includes(candidate.finishReason)),
  );
  let text = null;
  const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : null;
  if (parts) {
    const texts = parts.filter((p) => p && typeof p.text === 'string').map((p) => p.text);
    if (texts.length > 0) text = texts.join('');
  }
  return { text, safetyBlocked };
}

export function createGeminiClient({ apiKey, model, fetch = globalThis.fetch, sleep, now = Date.now, timeoutMs = 20000 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  async function generate(body) {
    const payload = JSON.stringify(body);
    let failureKind = null;
    let httpStatus = null;
    let retryAfter = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        await sleep(retryAfter ?? DEFAULT_WAITS[attempt - 2]);
      }
      retryAfter = null;
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: payload,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const name = err && err.name;
        failureKind = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
        httpStatus = null;
        continue;
      }

      httpStatus = response.status;
      if (response.status >= 200 && response.status < 300) {
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        const { text, safetyBlocked } = extractReply(json);
        return { outcome: 'reply', text, safetyBlocked, attempts: attempt, failureKind: null, httpStatus };
      }

      const status = response.status;
      if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
        failureKind = status === 408 ? 'timeout' : status === 429 ? '429' : '5xx';
        retryAfter = retryAfterMs(response.headers.get('retry-after'), now());
        continue;
      }

      return {
        outcome: 'configuration_error',
        text: null,
        safetyBlocked: false,
        attempts: attempt,
        failureKind: null,
        httpStatus: status,
      };
    }

    return {
      outcome: 'model_service_failure',
      text: null,
      safetyBlocked: false,
      attempts: MAX_ATTEMPTS,
      failureKind,
      httpStatus,
    };
  }

  return { generate };
}
