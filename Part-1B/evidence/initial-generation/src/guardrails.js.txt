// Deterministic guardrails (GR-01 to GR-07). No option or flag turns any check off (GR-05).
import { refusalOutput, KEY_PATTERN } from './contract.js';

// GR-02: requests for keys, environment, configuration or the system instructions.
export const SECRET_PATTERNS = Object.freeze([
  /\bapi[\s_-]?keys?\b/i,
  /\bGEMINI_API_KEY\b/i,
  /\.env\b/i,
  /\benvironment\s+variables?\b/i,
  /\bsystem\s+(prompt|instructions?|message)\b/i,
  /\b(reveal|repeat|print|show|output|display|share|leak|dump|encode)\s+(me\s+)?(your|the|these|all|any)\s+(hidden\s+|secret\s+|internal\s+|original\s+)?(instructions|prompt|configuration|config|secrets?|credentials?)\b/i,
]);

// GR-01: attempts to override rules, role, output format, intents or fields.
export const INJECTION_PATTERNS = Object.freeze([
  /\bignore\s+(all\s+)?(the\s+|your\s+|any\s+)?(previous|prior|above|earlier|preceding)\s+(instructions|rules|prompts?|messages?)\b/i,
  /\b(disregard|forget)\s+(all\s+)?(the\s+|your\s+)?(previous|prior|above|earlier\s+)?\s*(instructions|rules)\b/i,
  /\bdeveloper\s+mode\b/i,
  /\byou\s+are\s+now\b/i,
  /\bsystem\s*:/i,
  /\badd\s+(a\s+|an\s+)?(new\s+)?field\b/i,
  /\bset\s+(the\s+)?intent\s+to\b/i,
  /\boutput\s+format\b/i,
  /\b(change|modify|override|alter)\s+(the\s+|your\s+)?(output\s+)?(format|schema|rules|role)\b/i,
  /\bjailbreak\b/i,
]);

// GR-03: reminders whose purpose is violence, harm, harassment or threats.
export const HARM_PATTERNS = Object.freeze([
  /\bpoison(s|ed|ing)?\b/i,
  /\bkill(s|ed|ing)?\b/i,
  /\bthreat(en(s|ed|ing)?)?\b/i,
  /\bstalk(s|ed|ing)?\b/i,
  /\bhurt\s+(him|her|them|my|his|their|someone|somebody|people)\b/i,
  /\b(harass|bully|assault|stab)\w*\b/i,
  /\bbeat\s+up\b/i,
  /\b(self[\s-]?harm|suicide)\b/i,
]);

const ORDERED = Object.freeze([
  ['guardrail_secret_request', SECRET_PATTERNS],
  ['guardrail_injection', INJECTION_PATTERNS],
  ['guardrail_harmful', HARM_PATTERNS],
]);

// Scans the whole message; first match in the order secret → injection → harm (GR-04).
export function preCheck(message) {
  const text = typeof message === 'string' ? message : '';
  for (const [reason, patterns] of ORDERED) {
    if (patterns.some((re) => re.test(text))) return reason;
  }
  return null;
}

export function refusal(reason) {
  return refusalOutput(reason);
}

// GR-07 / INV-12 / INV-13: any string field with the key, an AIza value or the canary → refusal.
export function postCheck(output, { key, canary }) {
  const strings = Object.values(output).filter((v) => typeof v === 'string');
  const leaked = strings.some(
    (s) =>
      (typeof key === 'string' && key !== '' && s.includes(key)) ||
      KEY_PATTERN.test(s) ||
      (typeof canary === 'string' && canary !== '' && s.includes(canary)),
  );
  return leaked ? refusal('guardrail_secret_request') : output;
}
