import { invalidTransition, validationError } from './errors.js';

export const STATUSES = ['todo', 'in-progress', 'done'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const TASK_KEYS = ['id', 'title', 'status', 'priority', 'tags', 'createdAt'];
export const INPUT_KEYS = ['title', 'priority', 'tags', 'status'];

const MAX_TITLE = 200;
const MAX_TAGS = 20;
const MAX_TAG = 50;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function codePointLength(s) {
  return [...s].length;
}

export function validateTitle(v) {
  if (typeof v !== 'string') {
    throw validationError('Field title must be a string');
  }
  const title = v.trim();
  const len = codePointLength(title);
  if (len < 1 || len > MAX_TITLE) {
    throw validationError(`Field title must be 1-${MAX_TITLE} characters after trimming`);
  }
  return title;
}

export function validatePriority(v) {
  if (!PRIORITIES.includes(v)) {
    throw validationError(`Field priority must be one of: ${PRIORITIES.join(', ')}`);
  }
  return v;
}

export function validateStatusValue(v) {
  if (!STATUSES.includes(v)) {
    throw validationError(`Field status must be one of: ${STATUSES.join(', ')}`);
  }
  return v;
}

export function normalizeTags(v) {
  if (!Array.isArray(v)) {
    throw validationError('Field tags must be an array of strings');
  }
  if (v.length > MAX_TAGS) {
    throw validationError(`Field tags must contain at most ${MAX_TAGS} items`);
  }
  for (const item of v) {
    if (typeof item !== 'string') {
      throw validationError('Field tags must contain only strings');
    }
    const len = codePointLength(item.trim());
    if (len < 1 || len > MAX_TAG) {
      throw validationError(`Each tag must be 1-${MAX_TAG} characters after trimming`);
    }
  }
  const seen = new Set();
  for (const item of v) {
    seen.add(item.trim().toLowerCase());
  }
  return [...seen];
}

function assertKnownKeys(body) {
  for (const key of Object.keys(body)) {
    if (!INPUT_KEYS.includes(key)) {
      throw validationError(`Unknown or read-only field: ${key}`);
    }
  }
}

export function validateCreate(body) {
  if (!isPlainObject(body)) {
    throw validationError('Request body must be a JSON object');
  }
  assertKnownKeys(body);
  if (!('title' in body)) {
    throw validationError('Field title is required');
  }
  const title = validateTitle(body.title);
  const priority = 'priority' in body ? validatePriority(body.priority) : 'medium';
  const tags = 'tags' in body ? normalizeTags(body.tags) : [];
  if ('status' in body && body.status !== 'todo') {
    throw validationError("Field status must be 'todo' when creating a task");
  }
  return { title, priority, tags };
}

export const ALLOWED_TRANSITIONS = {
  todo: ['in-progress'],
  'in-progress': ['done', 'todo'],
  done: [],
};

export function assertTransition(from, to) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw invalidTransition(from, to);
  }
}

export function validatePatch(body) {
  if (!isPlainObject(body)) {
    throw validationError('Request body must be a JSON object');
  }
  if (Object.keys(body).length === 0) {
    throw validationError('Request body must contain at least one field');
  }
  assertKnownKeys(body);
  const changes = {};
  if ('title' in body) {
    changes.title = validateTitle(body.title);
  }
  if ('priority' in body) {
    changes.priority = validatePriority(body.priority);
  }
  if ('tags' in body) {
    changes.tags = normalizeTags(body.tags);
  }
  if ('status' in body) {
    changes.status = validateStatusValue(body.status);
  }
  return changes;
}

const LIST_QUERY_KEYS = ['tag', 'sort'];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

export function parseListQuery(searchParams) {
  for (const key of new Set(searchParams.keys())) {
    if (!LIST_QUERY_KEYS.includes(key)) {
      throw validationError(`Unknown query parameter: ${key}`);
    }
    if (searchParams.getAll(key).length > 1) {
      throw validationError(`Query parameter ${key} must appear at most once`);
    }
  }
  let tag;
  if (searchParams.has('tag')) {
    tag = searchParams.get('tag').trim().toLowerCase();
    const len = codePointLength(tag);
    if (len < 1 || len > MAX_TAG) {
      throw validationError(`Query parameter tag must be 1-${MAX_TAG} characters after trimming`);
    }
  }
  let sort;
  if (searchParams.has('sort')) {
    sort = searchParams.get('sort');
    if (sort !== 'priority') {
      throw validationError("Query parameter sort must be 'priority'");
    }
  }
  return { tag, sort };
}

export function filterByTag(list, tag) {
  return list.filter((t) => t.tags.includes(tag));
}

export function sortByPriority(list) {
  return [...list].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

function isNormalizedTags(tags) {
  if (!Array.isArray(tags)) {
    return false;
  }
  let normalized;
  try {
    normalized = normalizeTags(tags);
  } catch {
    return false;
  }
  return normalized.length === tags.length && normalized.every((t, i) => t === tags[i]);
}

export function isValidStoredTask(t) {
  if (!isPlainObject(t)) {
    return false;
  }
  const keys = Object.keys(t);
  if (keys.length !== TASK_KEYS.length || !TASK_KEYS.every((k) => keys.includes(k))) {
    return false;
  }
  if (typeof t.id !== 'string' || t.id === '') {
    return false;
  }
  if (typeof t.title !== 'string' || t.title !== t.title.trim()) {
    return false;
  }
  const titleLen = codePointLength(t.title);
  if (titleLen < 1 || titleLen > MAX_TITLE) {
    return false;
  }
  if (!STATUSES.includes(t.status) || !PRIORITIES.includes(t.priority)) {
    return false;
  }
  if (!isNormalizedTags(t.tags)) {
    return false;
  }
  if (typeof t.createdAt !== 'string' || !ISO_UTC.test(t.createdAt)) {
    return false;
  }
  const date = new Date(t.createdAt);
  return !Number.isNaN(date.getTime()) && date.toISOString() === t.createdAt;
}
