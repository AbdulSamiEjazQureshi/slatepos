import { writable } from 'svelte/store';

export const paletteOpen = writable(false);
export const openPalette = (): void => paletteOpen.set(true);
export const closePalette = (): void => paletteOpen.set(false);
export const togglePalette = (): void => paletteOpen.update((open) => !open);
