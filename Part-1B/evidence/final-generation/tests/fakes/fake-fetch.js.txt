// Fake fetch: replays scripted steps, records every call. Never touches the network.

export function createFakeFetch(steps) {
  const queue = [...steps];
  const fakeFetch = async (url, init) => {
    fakeFetch.calls.push({ url, init });
    const step = queue.shift();
    if (!step) {
      throw new Error('fake fetch: no more scripted steps');
    }
    if (step.throws) {
      throw step.throws;
    }
    const headers = step.headers ?? {};
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      headers: {
        get(name) {
          const v = lower[String(name).toLowerCase()];
          return v === undefined ? null : String(v);
        },
      },
      async json() {
        if (step.json !== undefined) return step.json;
        return JSON.parse(step.text ?? '');
      },
      async text() {
        if (step.text !== undefined) return step.text;
        return step.json === undefined ? '' : JSON.stringify(step.json);
      },
    };
  };
  fakeFetch.calls = [];
  return fakeFetch;
}

export function geminiBody(replyObject) {
  return {
    candidates: [
      {
        content: { parts: [{ text: JSON.stringify(replyObject) }] },
        finishReason: 'STOP',
      },
    ],
  };
}
