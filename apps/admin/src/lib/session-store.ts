import { derived, writable } from 'svelte/store';
import type { CurrentUser } from '@roms/contracts/auth';

/**
 * Client-side session state (kept in its own module so the Eden client can read
 * the auth headers without a circular import).
 *
 * The access token lives in memory only; the refresh token is an HttpOnly
 * cookie set by the API and never exposed to JavaScript.
 */
export const accessToken = writable<string | null>(null);
export const currentUser = writable<CurrentUser | null>(null);
export const branchId = writable<string | null>(null);

export const authenticated = derived(
	[accessToken, currentUser],
	([$token, $user]) => $token !== null && $user !== null
);

export const clearSession = (): void => {
	accessToken.set(null);
	currentUser.set(null);
	branchId.set(null);
};
