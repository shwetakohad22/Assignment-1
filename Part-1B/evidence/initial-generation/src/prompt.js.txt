// System prompt loading and Gemini request construction (GR-05, FR-17).
import fs from 'node:fs';
import { formatIst, weekdayIst, calendarHint } from './time.js';
import { INTENTS } from './contract.js';

export const SYSTEM_PROMPT_PATH = new URL('../prompts/system-prompt.md', import.meta.url);

export function loadSystemPrompt() {
  return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
}

export function readCanary(text = loadSystemPrompt()) {
  return text.split(/\r?\n/, 1)[0].trim();
}

export function escapeUserMessage(s) {
  return s.replace(/</g, '‹').replace(/>/g, '›');
}

export function buildUserText({ referenceMs, message }) {
  return (
    `REFERENCE_TIME: ${formatIst(referenceMs)} (${weekdayIst(referenceMs)})\n` +
    'TIMEZONE: Asia/Kolkata\n' +
    `CALENDAR: ${calendarHint(referenceMs).join(', ')}\n` +
    `<user_message>\n${escapeUserMessage(message)}\n</user_message>`
  );
}

const RESPONSE_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: [...INTENTS] },
    status: { type: 'STRING', enum: ['ok', 'needs_clarification', 'refused'] },
    task: { type: 'STRING', nullable: true },
    datetime: { type: 'STRING', nullable: true },
    snooze_minutes: { type: 'NUMBER', nullable: true },
    clarification_question: { type: 'STRING', nullable: true },
    reason: { type: 'STRING', nullable: true },
  },
  required: ['intent', 'status', 'task', 'datetime', 'snooze_minutes', 'clarification_question', 'reason'],
});

export function buildRequestBody({ referenceMs, message }) {
  return {
    systemInstruction: { parts: [{ text: loadSystemPrompt() }] },
    contents: [{ role: 'user', parts: [{ text: buildUserText({ referenceMs, message }) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: structuredClone(RESPONSE_SCHEMA),
    },
  };
}
