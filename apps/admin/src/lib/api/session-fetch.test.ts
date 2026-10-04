import { describe, expect, it, vi } from 'vitest';
import { createSessionFetch } from './session-fetch';

describe('session transport', () => {
	it('shares one refresh between expired requests and realtime renewal', async () => {
		let token = 'expired';
		const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			if (String(url).endsWith('/refresh')) {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return Response.json({ accessToken: 'fresh' });
			}
			return new Response('', {
				status: new Headers(init?.headers).get('authorization') === 'Bearer fresh' ? 200 : 401
			});
		});
		const request = createSessionFetch({
			baseUrl: 'http://api.test',
			token: () => token,
			setToken: (value) => (token = value),
			clear: vi.fn(),
			fetch: transport
		});
		const responses = await Promise.all([
			request('http://api.test/api/v1/orders', { headers: { authorization: 'Bearer expired' } }),
			request('http://api.test/api/v1/products', { headers: { authorization: 'Bearer expired' } }),
			request.refresh().then(() => new Response('', { status: 200 }))
		]);
		expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
		expect(transport.mock.calls.filter(([url]) => String(url).endsWith('/refresh'))).toHaveLength(
			1
		);
	});
	it('never retries a mutation after an uncertain network failure', async () => {
		const transport = vi.fn().mockRejectedValue(new TypeError('Disconnected'));
		const request = createSessionFetch({
			baseUrl: 'http://api.test',
			token: () => 'token',
			setToken: vi.fn(),
			clear: vi.fn(),
			fetch: transport
		});
		await expect(request('http://api.test/api/v1/payments', { method: 'POST' })).rejects.toThrow(
			'Disconnected'
		);
		expect(transport).toHaveBeenCalledTimes(1);
	});
});
