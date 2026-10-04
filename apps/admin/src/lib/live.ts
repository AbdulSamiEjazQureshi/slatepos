import { browser } from '$app/env';
import { derived, get, writable } from 'svelte/store';
import { onRealtime } from './realtime';
import type { RealtimeEvent } from '@roms/contracts/events';

/**
 * A single clock for the whole workspace. Ticket ages, "updated 3s ago" and
 * elapsed timers all read the same tick, so nothing disagrees about what time
 * it is — and one interval serves every surface instead of one per component.
 */
const createClock = () => {
	const { subscribe, update } = writable(0);
	let timer: ReturnType<typeof setInterval> | undefined;
	let refs = 0;

	return {
		subscribe(run: (value: number) => void) {
			if (browser) {
				refs += 1;
				if (refs === 1) timer = setInterval(() => update((n) => n + 1), 1000);
			}
			const unsubscribe = subscribe(run);
			// a fresh subscriber must not wait a full second for its first frame
			update((n) => n);
			return () => {
				unsubscribe();
				if (browser) {
					refs -= 1;
					if (refs === 0 && timer) {
						clearInterval(timer);
						timer = undefined;
					}
				}
			};
		}
	};
};

export const now = createClock();

/** Wall clock as a Date, re-derived on each tick — never cached in a page. */
export const nowDate = derived(now, () => new Date());

/**
 * Entities that changed in the last few seconds. A board reads this to keep the
 * changed row lit until the change is acknowledged — the one motion that tells
 * a cook "this ticket, not that one".
 */
const LIT_MS = 6000;
const lit = writable<Map<string, number>>(new Map());

export const litKeys = { subscribe: lit.subscribe };

const keyFor = (event: RealtimeEvent): string | null => {
	switch (event.type) {
		case 'order.created':
		case 'order.status_changed':
			return `order:${event.orderId}`;
		case 'order.item_status_changed':
			return `order:${event.orderId}`;
		case 'kitchen.ticket_status_changed':
			return `ticket:${event.ticketId}`;
		case 'table.status_changed':
			return `table:${event.tableId}`;
		case 'payment.status_changed':
			return `payment:${event.paymentId}`;
		default:
			return null;
	}
};

let sweeper: ReturnType<typeof setInterval> | undefined;

/** True while `key` is inside its lit window. */
export const isLit = (keys: Map<string, number>, key: string): boolean =>
	(keys.get(key) ?? 0) > Date.now() - LIT_MS;

if (browser) {
	onRealtime((event) => {
		const key = keyFor(event);
		if (!key) return;
		lit.update((map) => new Map(map).set(key, Date.now()));
		if (!sweeper) {
			sweeper = setInterval(() => {
				const cutoff = Date.now() - LIT_MS;
				const current = get(lit);
				let dirty = false;
				const next = new Map<string, number>();
				for (const [k, at] of current) {
					if (at > cutoff) next.set(k, at);
					else dirty = true;
				}
				if (dirty) lit.set(next);
			}, 1500);
		}
	});
}
