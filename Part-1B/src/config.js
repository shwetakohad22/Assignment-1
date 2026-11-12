// Flag parsing and configuration (FR-03, FR-04, FR-05). Never logs; problem texts are fixed.
import { parseReferenceTime } from './time.js';

export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const SUPPORTED_TIMEZONE = 'Asia/Kolkata';

const FLAGS = Object.freeze({ '--reference-time': 'referenceTime', '--timezone': 'timezone' });

export function parseArgs(argv) {
  const seen = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const field = Object.prototype.hasOwnProperty.call(FLAGS, name) ? FLAGS[name] : undefined;
    if (!field) return { ok: false, problem: 'unknown command-line argument' };
    if (Object.prototype.hasOwnProperty.call(seen, field)) {
      return { ok: false, problem: `duplicate ${name} flag` };
    }
    let value;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      if (i + 1 >= argv.length) return { ok: false, problem: `missing value for ${name}` };
      i += 1;
      value = argv[i];
    }
    if (value === '') return { ok: false, problem: `missing value for ${name}` };
    seen[field] = value;
  }
  return {
    ok: true,
    referenceTime: seen.referenceTime ?? null,
    timezone: seen.timezone ?? SUPPORTED_TIMEZONE,
  };
}

export function resolveConfig({ argv, env, nowMs }) {
  const model = typeof env.GEMINI_MODEL === 'string' && env.GEMINI_MODEL !== '' ? env.GEMINI_MODEL : DEFAULT_MODEL;
  const args = parseArgs(argv);
  if (!args.ok) return { ok: false, problem: args.problem, model };
  if (args.timezone !== SUPPORTED_TIMEZONE) {
    return { ok: false, problem: 'unsupported --timezone (only Asia/Kolkata)', model };
  }
  let referenceMs = nowMs;
  if (args.referenceTime !== null) {
    const parsed = parseReferenceTime(args.referenceTime);
    if (!parsed) return { ok: false, problem: 'invalid --reference-time (offset required)', model };
    referenceMs = parsed.ms;
  }
  const apiKey = env.GEMINI_API_KEY;
  if (typeof apiKey !== 'string' || apiKey === '') {
    return { ok: false, problem: 'GEMINI_API_KEY is not set', model };
  }
  return { ok: true, apiKey, model, referenceMs };
}
