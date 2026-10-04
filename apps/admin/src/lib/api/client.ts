import { treaty } from '@elysia/eden';
import type { App } from '@roms/api/app';
import { get } from 'svelte/store';
import { createSessionFetch } from './session-fetch';
import { accessToken, branchId, clearSession } from '../session-store';

/** Base URL of the separate Elysia API (never SvelteKit's own server). */
export const API_URL: string = import.meta.env?.VITE_API_URL ?? 'http://localhost:3000';

export type ApiErrorBody = {
	type: string;
	message: string;
	errors?: Record<string, string[]>;
	requestId?: string;
};

export class ApiError extends Error {
	readonly status: number;
	readonly type: string;
	readonly errors?: Record<string, string[]>;

	constructor(status: number, body: ApiErrorBody) {
		super(body.message);
		this.name = 'ApiError';
		this.status = status;
		this.type = body.type;
		if (body.errors) this.errors = body.errors;
	}
}

/**
 * Eden Treaty client, fully typed from the Elysia app. Auth headers are
 * resolved per-request from the session store; the refresh token travels as an
 * HttpOnly cookie (`credentials: 'include'`).
 */
const sessionFetch = createSessionFetch({
	baseUrl: API_URL,
	token: () => get(accessToken),
	setToken: (token) => accessToken.set(token),
	clear: clearSession
});
export const refreshSession = sessionFetch.refresh;

export const eden = treaty<App>(API_URL, {
	// Contracts transport ISO dates as strings. Eden otherwise coerces day keys into Date objects.
	parseDate: false,
	fetcher: sessionFetch,
	fetch: { credentials: 'include' },
	headers: () => {
		const headers: Record<string, string> = {};
		const token = get(accessToken);
		const branch = get(branchId);
		if (token) headers.authorization = `Bearer ${token}`;
		if (branch) headers['x-branch-id'] = branch;
		return headers;
	}
});

/** Shape Eden returns for every call: exactly one of `data`/`error`. */
export type EdenResult<T> = { data: T | null; error: unknown };

/**
 * Unwrap an Eden result, converting API errors into a thrown {@link ApiError} so
 * callers (and TanStack Query) can use normal try/catch semantics.
 */
export const unwrap = <T>(result: EdenResult<T>): T => {
	if (result.error !== null && result.error !== undefined) {
		const error = result.error as { status?: unknown; value?: unknown };
		const status = Number(error.status) || 500;
		const value = (error.value ?? null) as ApiErrorBody | null;
		throw new ApiError(status, {
			...value,
			type: value?.type ?? 'error',
			message: value?.message ?? `Request failed with status ${status}`
		});
	}
	return result.data as T;
};
