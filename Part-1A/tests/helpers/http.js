import assert from 'node:assert/strict';

export async function request(baseUrl, method, path, { json, raw } = {}) {
  const init = { method };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
  } else if (raw !== undefined) {
    init.body = raw;
  }
  const res = await fetch(baseUrl + path, init);
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    body: text === '' ? undefined : JSON.parse(text),
  };
}

export function post(baseUrl, path, options) {
  return request(baseUrl, 'POST', path, options);
}

export function patch(baseUrl, path, options) {
  return request(baseUrl, 'PATCH', path, options);
}

export function get(baseUrl, path) {
  return request(baseUrl, 'GET', path);
}

export function del(baseUrl, path) {
  return request(baseUrl, 'DELETE', path);
}

export function assertJsonResponse(res, status) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('content-type'), 'application/json');
}

export function assertError(res, status, code) {
  assertJsonResponse(res, status);
  assert.deepEqual(Object.keys(res.body).sort(), ['error', 'message']);
  assert.equal(res.body.error, code);
  assert.equal(typeof res.body.message, 'string');
  assert.ok(res.body.message.length > 0, 'message must be non-empty');
  assert.doesNotMatch(res.body.message, /\n\s+at /);
  assert.doesNotMatch(res.body.message, /[\\/]src[\\/]/);
}
