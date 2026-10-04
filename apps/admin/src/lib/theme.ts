import { browser } from '$app/env';
import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

const KEY = 'roms.theme';

const read = (): Theme => {
	if (!browser) return 'light';
	const stored = localStorage.getItem(KEY);
	if (stored === 'dark' || stored === 'light') return stored;
	return 'light';
};

/** Light is the plate the counter works on; dark is the same system at night. */
export const theme = writable<Theme>(read());

const apply = (value: Theme): void => {
	if (!browser) return;
	document.documentElement.classList.toggle('dark', value === 'dark');
	localStorage.setItem(KEY, value);
};

if (browser) {
	apply(read());
	theme.subscribe(apply);
}

export const toggleTheme = (): void =>
	theme.update((value) => (value === 'dark' ? 'light' : 'dark'));
