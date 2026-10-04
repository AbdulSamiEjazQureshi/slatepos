import type { FieldErrors } from '@roms/contracts/common';

/** Consistent error body used by every endpoint and the error plugin. */
export const apiError = (
  type: string,
  message: string,
  extra: { requestId?: string; errors?: FieldErrors } = {}
): { type: string; message: string; requestId?: string; errors?: FieldErrors } => ({
  type,
  message,
  ...(extra.requestId ? { requestId: extra.requestId } : {}),
  ...(extra.errors ? { errors: extra.errors } : {})
});
