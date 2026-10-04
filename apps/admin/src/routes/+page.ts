import { redirect } from '@sveltejs/kit';

/** The root sends users into the authenticated workspace. */
export const load = (): void => {
	throw redirect(307, '/dashboard');
};
