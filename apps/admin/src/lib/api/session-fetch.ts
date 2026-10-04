/** Retry only an explicit authentication rejection, never an uncertain mutation. */
export function createSessionFetch(options: {
	baseUrl: string;
	token: () => string | null;
	setToken: (token: string) => void;
	clear: () => void;
	fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): typeof fetch & { refresh: () => Promise<boolean> } {
	const transport = options.fetch ?? fetch;
	let refreshing: Promise<boolean> | null = null;
	const refresh = async (): Promise<boolean> => {
		try {
			const response = await transport(`${options.baseUrl}/api/v1/auth/refresh`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: '{}',
				signal: AbortSignal.timeout(15_000)
			});
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) options.clear();
				return false;
			}
			const data = await response.json();
			if (typeof data.accessToken !== 'string') return false;
			options.setToken(data.accessToken);
			return true;
		} catch {
			return false;
		}
	};
	const refreshSession = () =>
		(refreshing ??= refresh().finally(() => {
			refreshing = null;
		}));
	const sessionFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const settings = { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) };
		const response = await transport(input, settings);
		const path = new URL(String(input), options.baseUrl).pathname;
		if (response.status !== 401 || path.startsWith('/api/v1/auth/') || !options.token())
			return response;
		const sentToken = new Headers(init?.headers).get('authorization');
		if (sentToken === `Bearer ${options.token()}`) {
			if (!(await refreshSession())) return response;
		}
		const headers = new Headers(init?.headers);
		headers.set('authorization', `Bearer ${options.token()}`);
		return transport(input, { ...settings, headers });
	}) as typeof fetch;
	return Object.assign(sessionFetch, { refresh: refreshSession });
}
