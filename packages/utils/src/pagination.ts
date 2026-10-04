export type SortDirection = 'asc' | 'desc';

export type OffsetPagination = {
  page: number;
  pageSize: number;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type Paginated<T> = {
  items: T[];
  meta: PaginationMeta;
};

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/** Normalise arbitrary query input into a bounded offset pagination window. */
export const normalizePagination = (input: {
  page?: number | string | null;
  pageSize?: number | string | null;
}): OffsetPagination => {
  const page = Math.max(1, Math.trunc(Number(input.page) || 1));
  const requested = Math.trunc(Number(input.pageSize) || DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  return { page, pageSize };
};

export const offsetOf = ({ page, pageSize }: OffsetPagination): number => (page - 1) * pageSize;

export const buildMeta = ({ page, pageSize }: OffsetPagination, total: number): PaginationMeta => {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
};

export const paginate = <T>(
  items: T[],
  pagination: OffsetPagination,
  total: number
): Paginated<T> => ({ items, meta: buildMeta(pagination, total) });

export const encodeCursor = (value: Record<string, string | number>): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

export const decodeCursor = <T extends Record<string, string | number>>(
  cursor: string
): T | null => {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
};
