import { Elysia } from 'elysia';
import type { FieldErrors } from '@roms/contracts';
import { AppError, ErrorCode } from '@roms/utils';
import type { AppDeps } from '../app/deps';
import { apiError } from '../lib/api-error';
import type { RequestContext } from '../lib/context';
import { corePlugin } from './core';
import { authPlugin } from './auth';

const fieldErrorsFromValidation = (
  all: readonly { path?: string; message?: string }[]
): FieldErrors => {
  const errors: FieldErrors = {};
  for (const issue of all) {
    const key = (issue.path ?? '').replace(/^\//, '').replace(/\//g, '.') || '_root';
    const list = errors[key] ?? [];
    list.push(issue.message ?? 'Invalid value');
    errors[key] = list;
  }
  return errors;
};

/**
 * Converts every error — validation, domain, or unexpected — into the single
 * documented error shape. Stack traces are never leaked in production.
 */
export const errorHandlerPlugin = (deps: AppDeps) =>
  new Elysia({ name: 'error-handler' })
    .use(corePlugin(deps))
    .use(authPlugin(deps))
    .onError({ as: 'global' }, ({ code, error, set, ctx }) => {
      const requestContext = (ctx as { ctx?: RequestContext } | undefined)?.ctx;
      const requestId = requestContext?.requestId ?? crypto.randomUUID();

      if (error instanceof AppError) {
        set.status = error.status;
        return apiError(error.code, error.message, {
          requestId,
          ...(error.details ? { errors: error.details } : {})
        });
      }

      if (code === 'VALIDATION') {
        set.status = 422;
        const issues = (error as { all?: { path?: string; message?: string }[] }).all ?? [];
        return apiError(ErrorCode.VALIDATION_ERROR, 'Validation failed', {
          requestId,
          errors: fieldErrorsFromValidation(issues)
        });
      }

      if (code === 'NOT_FOUND') {
        set.status = 404;
        return apiError(ErrorCode.NOT_FOUND, 'Resource not found', { requestId });
      }

      if (code === 'PARSE') {
        set.status = 400;
        return apiError(ErrorCode.BAD_REQUEST, 'Malformed request body', { requestId });
      }

      deps.logger.error({ err: error, requestId, code }, 'Unhandled error');
      set.status = 500;
      return apiError(
        ErrorCode.INTERNAL_ERROR,
        deps.config.isProduction ? 'An unexpected error occurred' : String(error),
        { requestId }
      );
    });
