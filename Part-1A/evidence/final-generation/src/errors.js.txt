export const ERROR_CODES = {
  INVALID_JSON: 'INVALID_JSON',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function validationError(message) {
  return new ApiError(400, ERROR_CODES.VALIDATION_ERROR, message);
}

export function invalidJson(message) {
  return new ApiError(400, ERROR_CODES.INVALID_JSON, message);
}

export function taskNotFound(id) {
  return new ApiError(404, ERROR_CODES.TASK_NOT_FOUND, `Task '${id}' not found`);
}

export function routeNotFound(method, path) {
  return new ApiError(404, ERROR_CODES.ROUTE_NOT_FOUND, `Route ${method} ${path} not found`);
}

export function invalidTransition(from, to) {
  return new ApiError(
    409,
    ERROR_CODES.INVALID_STATUS_TRANSITION,
    `Cannot change status from '${from}' to '${to}'`,
  );
}

export class DataFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataFileError';
  }
}
