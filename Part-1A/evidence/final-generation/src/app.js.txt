import { ApiError, ERROR_CODES, routeNotFound, validationError } from './errors.js';
import { parseJson, readBody, sendError, sendJson, sendNoContent } from './http.js';
import { codePointLength, filterByTag, parseListQuery, sortByPriority } from './tasks.js';

const MAX_ID_LENGTH = 100;
const LIST_PATH = '/tasks';
const ITEM_PATTERN = /^\/tasks\/([^/]+)$/;

function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    if (typeof route.pattern === 'string') {
      if (route.pattern === pathname) {
        return { route, rawId: undefined };
      }
      continue;
    }
    const match = route.pattern.exec(pathname);
    if (match) {
      return { route, rawId: match[1] };
    }
  }
  return null;
}

function decodeId(rawId) {
  let id;
  try {
    id = decodeURIComponent(rawId);
  } catch (err) {
    if (err instanceof URIError) {
      throw validationError('Task id is not valid URL encoding');
    }
    throw err;
  }
  if (codePointLength(id) > MAX_ID_LENGTH) {
    throw validationError(`Task id must be at most ${MAX_ID_LENGTH} characters`);
  }
  return id;
}

export function createApp(store) {
  // Route table: { method, pattern, handler }. pattern is the exact path LIST_PATH or
  // ITEM_PATTERN for routes that take a task id.
  const routes = [
    {
      method: 'POST',
      pattern: LIST_PATH,
      handler: async ({ req, res }) => {
        const text = await readBody(req);
        const body = parseJson(text);
        const task = await store.create(body);
        sendJson(res, 201, task);
      },
    },
    {
      method: 'GET',
      pattern: LIST_PATH,
      handler: async ({ res, url }) => {
        const q = parseListQuery(url.searchParams);
        let result = store.list();
        if (q.tag !== undefined) {
          result = filterByTag(result, q.tag);
        }
        if (q.sort !== undefined) {
          result = sortByPriority(result);
        }
        sendJson(res, 200, result);
      },
    },
    {
      method: 'GET',
      pattern: ITEM_PATTERN,
      handler: async ({ res, id }) => {
        sendJson(res, 200, store.get(id));
      },
    },
    {
      method: 'PATCH',
      pattern: ITEM_PATTERN,
      handler: async ({ req, res, id }) => {
        const text = await readBody(req);
        const body = parseJson(text);
        const task = await store.update(id, body);
        sendJson(res, 200, task);
      },
    },
    {
      method: 'DELETE',
      pattern: ITEM_PATTERN,
      handler: async ({ res, id }) => {
        await store.remove(id);
        sendNoContent(res);
      },
    },
  ];

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const found = matchRoute(routes, req.method, url.pathname);
      if (!found) {
        throw routeNotFound(req.method, url.pathname);
      }
      const { route, rawId } = found;
      const isList = route.method === 'GET' && route.pattern === LIST_PATH;
      if (!isList && url.searchParams.size > 0) {
        throw validationError('Query parameters are not supported on this route');
      }
      const id = rawId === undefined ? undefined : decodeId(rawId);
      await route.handler({ req, res, url, id, store });
    } catch (err) {
      if (err instanceof ApiError) {
        sendError(res, err.status, err.code, err.message);
        return;
      }
      console.error(err);
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Internal server error');
    }
  };
}
