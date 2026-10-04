import {
  AppError,
  buildMeta,
  type OffsetPagination,
  type PaginationMeta,
  type Result
} from '@roms/utils';

/** Throw the contained AppError, or return the success value. */
export const unwrap = <T>(result: Result<T, AppError>): T => {
  if (result.ok) return result.value;
  throw result.error;
};

/** Convert an optional Date into an ISO string for the API boundary. */
export const iso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

export const isoRequired = (value: Date): string => value.toISOString();

export type Page<T> = { items: T[]; meta: PaginationMeta };

export const page = <T>(items: T[], total: number, pagination: OffsetPagination): Page<T> => ({
  items,
  meta: buildMeta(pagination, total)
});
