import { browser } from '$app/env';
import { derived, get, writable } from 'svelte/store';
import type { RealtimeEvent } from '@roms/contracts/events';
import { accessToken } from './session-store';
import { API_URL, refreshSession } from './api/client';

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline';

/** The socket's mood, read by the top bar's connection mark. */
export const connection = writable<ConnectionState>('idle');

/** The last event of each kind, plus a monotonically increasing tick so views
 *  can react to repeats of the same event. */
export const lastEvent = writable<{ event: RealtimeEvent; at: number; tick: number } | null>(null);

export const isLive = derived(connection, ($c) => $c === 'live');

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

/** Subscribe to every realtime event. Returns an unsubscribe function. */
export const onRealtime = (fn: Listener): (() => void) => {
	listeners.add(fn);
	return () => listeners.delete(fn);
};

let socket: WebSocket | null = null;
let running = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let attempt = 0;

const socketUrl = (token: string): string =>
	`${API_URL.replace(/^http/, 'ws')}/api/ws?token=${encodeURIComponent(token)}`;

const clearTimers = (): void => {
	clearTimeout(reconnectTimer);
	clearInterval(heartbeat);
};

const scheduleReconnect = (): void => {
	if (!browser || !running) return;
	if (!get(accessToken)) {
		connection.set('idle');
		return;
	}
	attempt += 1;
	// exponential backoff, capped — a kitchen screen must keep trying quietly
	const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 20_000);
	connection.set('reconnecting');
	reconnectTimer = setTimeout(connect, delay);
};

function connect(): void {
	if (!browser || !running) return;
	const token = get(accessToken);
	if (!token) {
		connection.set('idle');
		return;
	}
	if (
		socket &&
		(socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
	)
		return;

	connection.set(attempt === 0 ? 'connecting' : 'reconnecting');
	const activeSocket = new WebSocket(socketUrl(token));
	socket = activeSocket;

	activeSocket.onopen = () => {
		if (socket !== activeSocket || !running) return;
		attempt = 0;
		connection.set('live');
		heartbeat = setInterval(() => {
			if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
		}, 25_000);
	};

	activeSocket.onmessage = (message) => {
		if (socket !== activeSocket || !running) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(String(message.data));
		} catch {
			return;
		}
		if (!parsed || typeof parsed !== 'object') return;
		const type = (parsed as { type?: string }).type;
		if (type === 'pong' || type === 'ready' || type === 'error') return;
		const event = parsed as RealtimeEvent;
		lastEvent.update((prev) => ({ event, at: Date.now(), tick: (prev?.tick ?? 0) + 1 }));
		for (const listener of listeners) {
			try {
				listener(event);
			} catch {
				/* a bad listener must not kill the socket */
			}
		}
	};

	activeSocket.onclose = async (event) => {
		if (socket !== activeSocket) return;
		clearTimers();
		socket = null;
		// Expired access tokens share the HTTP refresh flight, including cookie rotation.
		if (event.code === 4401 && running) {
			connection.set('reconnecting');
			if (await refreshSession()) {
				connect();
				return;
			}
		}
		scheduleReconnect();
	};

	activeSocket.onerror = () => {
		// onclose follows and owns the retry.
	};
}

/** Start the socket (idempotent). Call once the session is authenticated. */
export const startRealtime = (): void => {
	if (!browser) return;
	running = true;
	attempt = 0;
	connect();
};

export const stopRealtime = (): void => {
	running = false;
	clearTimers();
	attempt = 0;
	socket?.close();
	socket = null;
	connection.set('idle');
};

// A fresh access token (login/refresh) should revive a socket that gave up.
let unsubscribeToken = () => {};
if (browser) {
	unsubscribeToken = accessToken.subscribe((token) => {
		if (running && token && (!socket || socket.readyState > WebSocket.OPEN)) {
			attempt = 0;
			connect();
		}
		if (!token) stopRealtime();
	});
}

if (import.meta.hot)
	import.meta.hot.dispose(() => {
		stopRealtime();
		unsubscribeToken();
	});
