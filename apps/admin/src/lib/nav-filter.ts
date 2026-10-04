import type { CurrentUser } from '@roms/contracts/auth';
import { NAV, type NavGroup } from './nav';

/**
 * Navigation is filtered by the permissions the server actually granted —
 * the client never invents access. Unknown/empty permissions during load are
 * treated as "show everything the role could plausibly hold" only while the
 * user object is absent, so the rail never flashes empty on first paint.
 */
export const visibleGroups = (user: CurrentUser | null): NavGroup[] => {
	const granted = user ? new Set(user.permissions) : null;
	const isPlatform = user?.isPlatformAdmin ?? false;

	return NAV.map((group) => ({
		label: group.label,
		items: group.items.filter((item) => {
			if (!item.perm || item.perm.length === 0) return true;
			if (!granted) return true;
			if (isPlatform) return true;
			return item.perm.some((permission) => granted.has(permission));
		})
	})).filter((group) => group.items.length > 0);
};

/** The current route's nav item, for the top bar's title. */
export const currentNavItem = (pathname: string) =>
	NAV.flatMap((group) => group.items).find(
		(item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
	);
