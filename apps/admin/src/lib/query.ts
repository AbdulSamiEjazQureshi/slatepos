import { QueryClient } from '@tanstack/svelte-query';

/**
 * TanStack Query client for interactive server state (products, orders,
 * dashboards). SvelteKit server loading is used where it is sufficient.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 15_000,
			retry: 1,
			refetchOnWindowFocus: false
		}
	}
});
