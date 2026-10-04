import type { CurrentUser } from '@roms/contracts/auth';
import { get } from 'svelte/store';
import { eden, unwrap, refreshSession } from './api/client';
import { accessToken, authenticated, branchId, clearSession, currentUser } from './session-store';

export { accessToken, branchId, currentUser, authenticated };

const loadMe = async (): Promise<CurrentUser | null> => {
	const token = get(accessToken);
	if (!token) return null;
	try {
		const me = unwrap(await eden.api.v1.auth.me.get());
		currentUser.set(me);
		if (!get(branchId) && me.branchIds.length > 0) branchId.set(me.branchIds[0] ?? null);
		return me;
	} catch {
		clearSession();
		return null;
	}
};

/** Session actions built on the Eden Treaty client. */
export const session = {
	async login(email: string, password: string, tenantSlug?: string): Promise<CurrentUser> {
		const result = unwrap(
			await eden.api.v1.auth.login.post({ email, password, ...(tenantSlug ? { tenantSlug } : {}) })
		);
		accessToken.set(result.tokens.accessToken);
		const user = await loadMe();
		if (!user) throw new Error('Login succeeded but the session could not be loaded');
		return user;
	},

	/** Silent refresh using the HttpOnly cookie. */
	async restore(): Promise<boolean> {
		try {
			if (!(await refreshSession())) return false;
			return (await loadMe()) !== null;
		} catch {
			clearSession();
			return false;
		}
	},

	async logout(): Promise<void> {
		try {
			await eden.api.v1.auth.logout.post({});
		} catch {
			// Ignore network errors on logout.
		}
		clearSession();
	},

	loadMe,

	setBranch(id: string): void {
		branchId.set(id);
	},

	/** Snapshot of credentials for imperative use. */
	apiToken(): { token: string | null; branchId: string | null } {
		return { token: get(accessToken), branchId: get(branchId) };
	}
};
