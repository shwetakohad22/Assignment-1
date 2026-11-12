import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMalformed, MAX_MESSAGE_LENGTH } from '../src/input-checks.js';

test('FR-02: empty, whitespace-only and letter-free messages are malformed', () => {
  for (const m of ['', '   \n\t', '{{{{ ;;; ]]] 12345 @@@', '12345']) {
    assert.equal(isMalformed(m), true, JSON.stringify(m));
  }
});

test('AC-09: a 1,200-character message is malformed', () => {
  const m = 'remind me to drink water '.repeat(48);
  assert.equal(m.length, 1200);
  assert.equal(isMalformed(m), true);
});

test('FR-02: length boundary is 1,000 characters after trimming', () => {
  assert.equal(MAX_MESSAGE_LENGTH, 1000);
  assert.equal(isMalformed('a'.repeat(1000)), false);
  assert.equal(isMalformed('a'.repeat(1001)), true);
  assert.equal(isMalformed('  ' + 'a'.repeat(1000) + '  '), false);
});

test('FR-02: letters in any script count (Devanagari is not malformed)', () => {
  assert.equal(isMalformed('कल याद दिलाना'), false);
  assert.equal(isMalformed('Remind me to call mom tomorrow at 5pm'), false);
});
