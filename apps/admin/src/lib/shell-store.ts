import { browser } from '$app/env';
import { writable } from 'svelte/store';

const KEY = 'roms.rail.collapsed';

const read = (): boolean => (browser ? localStorage.getItem(KEY) === '1' : false);

/** The rail collapses to icons when a cashier needs the width back. */
export const railCollapsed = writable<boolean>(read());

export const toggleRail = (): void => railCollapsed.update((value) => !value);

if (browser) {
	railCollapsed.subscribe((value) => localStorage.setItem(KEY, value ? '1' : '0'));
}

/** A branch switch must never move a ticket into another branch. */
export const branchSwitchLocked = writable(false);
