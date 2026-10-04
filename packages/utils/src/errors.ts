import type { Result } from './result';
import { err, ok } from './result';

/**
 * Machine-readable error codes shared across the platform.
 * Grouped by area so clients can branch on them without string matching.
 */
export const ErrorCode = {
  // Generic
  VALIDATION_ERROR: 'validation_error',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  FORBIDDEN: 'forbidden',
  UNAUTHORIZED: 'unauthorized',
  RATE_LIMITED: 'rate_limited',
  INTERNAL_ERROR: 'internal_error',
  BAD_REQUEST: 'bad_request',

  // Auth
  INVALID_CREDENTIALS: 'invalid_credentials',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  REFRESH_TOKEN_REUSED: 'refresh_token_reused',
  ACCOUNT_DISABLED: 'account_disabled',
  EMAIL_NOT_VERIFIED: 'email_not_verified',

  // Tenancy / authz
  TENANT_REQUIRED: 'tenant_required',
  BRANCH_REQUIRED: 'branch_required',
  TENANT_MISMATCH: 'tenant_mismatch',
  BRANCH_FORBIDDEN: 'branch_forbidden',
  PERMISSION_DENIED: 'permission_denied',

  // Domain
  INVALID_STATE_TRANSITION: 'invalid_state_transition',
  INSUFFICIENT_STOCK: 'insufficient_stock',
  PAYMENT_FAILED: 'payment_failed',
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  CONCURRENCY_CONFLICT: 'concurrency_conflict',
  UNPROCESSABLE: 'unprocessable'
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Field-level validation details: `{ items: ["Product is unavailable"] }`. */
export type FieldErrors = Record<string, string[]>;

export type AppErrorShape = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly status: number;
  readonly details?: FieldErrors;
};

/**
 * A domain/application error. Carries an HTTP status so the Elysia error
 * plugin can translate it into a consistent response body.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: FieldErrors;

  constructor(shape: AppErrorShape) {
    super(shape.message);
    this.name = 'AppError';
    this.code = shape.code;
    this.status = shape.status;
    if (shape.details) this.details = shape.details;
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError({ code: ErrorCode.NOT_FOUND, message, status: 404 });
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError({ code: ErrorCode.UNAUTHORIZED, message, status: 401 });
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppError {
    return new AppError({ code: ErrorCode.FORBIDDEN, message, status: 403 });
  }

  static conflict(message: string): AppError {
    return new AppError({ code: ErrorCode.CONFLICT, message, status: 409 });
  }

  static validation(message: string, details?: FieldErrors): AppError {
    const shape: AppErrorShape = { code: ErrorCode.VALIDATION_ERROR, message, status: 422 };
    return new AppError(details ? { ...shape, details } : shape);
  }

  static unprocessable(code: ErrorCode, message: string, details?: FieldErrors): AppError {
    const shape: AppErrorShape = { code, message, status: 422 };
    return new AppError(details ? { ...shape, details } : shape);
  }
}

/** Lift an `AppError` into a Result. */
export const fail = (error: AppError): Result<never, AppError> => err(error);
export const succeed = <T>(value: T): Result<T, AppError> => ok(value);
