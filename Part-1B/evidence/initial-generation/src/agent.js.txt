// Agent pipeline (plan.md "Agent pipeline"). Each step may return early with a final output.
import { resolveConfig } from './config.js';
import { errorOutput, clarifyOutput, exitCodeFor, validateOutput, MALFORMED_QUESTION } from './contract.js';
import { isMalformed } from './input-checks.js';
import { preCheck, postCheck, refusal } from './guardrails.js';
import { buildRequestBody, readCanary } from './prompt.js';
import { createGeminiClient } from './gemini-client.js';
import { normalize } from './normalize.js';

function finish(output, { attempts = 0, failureKind = null, httpStatus = null, model, stderrMessage = null }) {
  return {
    output,
    exitCode: exitCodeFor(output),
    diag: { attempts, failure_kind: failureKind, http_status: httpStatus, model },
    stderrMessage,
  };
}

export async function runAgent({ argv, message, env, modelClient, nowMs = Date.now(), sleep }) {
  // 1–2. flags and configuration (before any input check, so AC-24 holds for any input)
  const config = resolveConfig({ argv, env, nowMs });
  if (!config.ok) {
    return finish(errorOutput('configuration_error'), { model: config.model, stderrMessage: config.problem });
  }
  const { apiKey, model, referenceMs } = config;

  // 3. the message is given (read by the caller)
  const text = typeof message === 'string' ? message : '';

  // 4. malformed input: no model call (FR-02)
  if (isMalformed(text)) {
    return finish(clarifyOutput('malformed_input', null, MALFORMED_QUESTION), { model });
  }

  // 5. deterministic guardrail pre-check: no model call (GR-01 to GR-04)
  const preReason = preCheck(text);
  if (preReason !== null) {
    return finish(refusal(preReason), { model });
  }

  // 6. request
  const body = buildRequestBody({ referenceMs, message: text });

  // 7. model call
  const client = modelClient ?? createGeminiClient({ apiKey, model, sleep });
  const result = await client.generate(body);
  const callInfo = { attempts: result.attempts, failureKind: result.failureKind, httpStatus: result.httpStatus, model };
  if (result.outcome === 'configuration_error') {
    return finish(errorOutput('configuration_error'), callInfo);
  }
  if (result.outcome === 'model_service_failure') {
    return finish(errorOutput('model_service_failure'), callInfo);
  }
  if (result.safetyBlocked) {
    return finish(refusal('guardrail_harmful'), callInfo);
  }

  // 8. normalise the reply
  const candidate = normalize(result.text, { referenceMs });

  // 9. post-check: key value, AIza pattern, canary → refusal (GR-07)
  const canary = readCanary();
  let final = postCheck(candidate, { key: apiKey, canary });

  // 10. full invariant check; never emit an invalid object
  if (validateOutput(final, referenceMs, { key: apiKey, canary }).length > 0) {
    final = errorOutput('invalid_model_output');
  }

  // 11. exit code and diagnostics
  return finish(final, callInfo);
}
