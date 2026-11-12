// Malformed-input check (FR-02). Runs before any model call.

export const MAX_MESSAGE_LENGTH = 1000;

const LETTER = /\p{L}/u;

export function isMalformed(message) {
  const t = typeof message === 'string' ? message.trim() : '';
  return t === '' || !LETTER.test(t) || t.length > MAX_MESSAGE_LENGTH;
}
