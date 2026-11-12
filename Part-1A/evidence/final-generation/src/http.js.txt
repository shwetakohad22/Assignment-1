import { invalidJson, validationError } from './errors.js';

export const MAX_BODY_BYTES = 102400;

export function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(validationError(`Request body must not exceed ${limit} bytes`));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw invalidJson('Request body is not valid JSON');
  }
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

export function sendError(res, status, code, message) {
  sendJson(res, status, { error: code, message });
}
