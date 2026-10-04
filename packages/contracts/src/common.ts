import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/** Standard list query: pagination + sorting + search. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().trim().max(64).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  q: z.string().trim().max(200).optional()
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNext: z.boolean(),
  hasPrevious: z.boolean()
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const uuidSchema = z.string().uuid();

/** Money as a decimal string so precision survives JSON transport. */
export const moneySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a decimal string with up to 4 decimal places');

export const rateSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a non-negative decimal string');
export type Rate = z.infer<typeof rateSchema>;

/** Field-level errors, e.g. `{ items: ["Product is unavailable"] }`. */
export const fieldErrorsSchema = z.record(z.string(), z.array(z.string()));
export type FieldErrors = z.infer<typeof fieldErrorsSchema>;

/** The one error shape every endpoint returns. */
export const apiErrorSchema = z.object({
  type: z.string(),
  message: z.string(),
  errors: fieldErrorsSchema.optional(),
  requestId: z.string().optional()
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Wrap a payload schema in the standard list envelope. */
export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    meta: paginationMetaSchema
  });

export type Paginated<T> = { items: T[]; meta: PaginationMeta };

export const okSchema = z.object({ ok: z.literal(true) });

export const isoDateSchema = z.string().datetime({ offset: true });
