import { browser } from '$app/env';
import { cubicOut } from 'svelte/easing';
import {
	fade as fadeTransition,
	fly as flyTransition,
	type FadeParams,
	type FlyParams
} from 'svelte/transition';

/**
 * Whether the person has asked the system for less movement.
 *
 * CSS is handled globally in `base.css`, but Svelte's JS transitions run in
 * script and are invisible to it — a `transition:fly` on a modal would still
 * slide under `prefers-reduced-motion: reduce` unless the component checks.
 * Read lazily rather than at module load so a change mid-session is honoured.
 */
export const prefersReducedMotion = (): boolean =>
	browser &&
	typeof matchMedia === 'function' &&
	matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Svelte's `fly`, collapsed to a plain fade when movement is unwelcome.
 *
 * The duration is kept rather than zeroed: something that appears instantly
 * reads as a glitch, and the guidance is to reduce motion, not to remove the
 * sense that a thing arrived.
 */
export const fly = (node: Element, params: FlyParams = {}) => {
	if (!prefersReducedMotion()) return flyTransition(node, params);
	const { duration = 200, opacity = 0 } = params;
	return {
		duration,
		easing: cubicOut,
		css: (t: number) => `opacity: ${opacity + (1 - opacity) * t}`
	};
};

/** Svelte's `fade`. Already motion-free, so this only forwards it — kept here
 *  so every transition in the app is imported from one place. */
export const fade = (node: Element, params: FadeParams = {}) => fadeTransition(node, params);
