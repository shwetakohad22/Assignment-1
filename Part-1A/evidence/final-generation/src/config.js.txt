import path from 'node:path';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DATA_FILE = path.resolve(import.meta.dirname, '..', 'data', 'tasks.json');

function parsePort(value) {
  if (value === undefined) {
    return DEFAULT_PORT;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid PORT: "${value}" (expected integer 0-65535)`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${value}" (expected integer 0-65535)`);
  }
  return port;
}

function parseHost(value) {
  if (value === undefined) {
    return DEFAULT_HOST;
  }
  const host = value.trim();
  if (host === '') {
    throw new Error('Invalid HOST: must be a non-empty string');
  }
  return host;
}

function parseDataFile(value) {
  if (value === undefined) {
    return DEFAULT_DATA_FILE;
  }
  if (value.trim() === '') {
    throw new Error('Invalid DATA_FILE: must be a non-empty path');
  }
  return path.resolve(value);
}

export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.PORT),
    host: parseHost(env.HOST),
    dataFile: parseDataFile(env.DATA_FILE),
  };
}
