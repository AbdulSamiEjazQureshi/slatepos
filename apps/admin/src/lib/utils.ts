import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes, resolving conflicts (shadcn-svelte convention). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** Format a decimal money string for display. */
export const formatMoney = (amount: string, currency = 'PKR', locale = 'en-PK'): string => {
	const value = Number(amount);
	if (Number.isNaN(value)) return amount;
	return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
};

export const formatDateTime = (value: string | Date | null): string => {
	if (!value) return '—';
	return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(value)
	);
};

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
