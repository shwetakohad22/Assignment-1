// Fake model client: returns scripted client results, records each request body.

export function createFakeModel(results) {
  const queue = [...results];
  const calls = [];
  return {
    calls,
    async generate(body) {
      calls.push(body);
      const next = queue.shift();
      if (!next) {
        throw new Error('fake model: no more scripted results');
      }
      return next;
    },
  };
}

export function reply(obj, attempts = 1) {
  return {
    outcome: 'reply',
    text: JSON.stringify(obj),
    safetyBlocked: false,
    attempts,
    failureKind: null,
    httpStatus: 200,
  };
}
