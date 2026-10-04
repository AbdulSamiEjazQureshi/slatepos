import { writable } from 'svelte/store';

/** tenant currency, set once the session (or tenant settings) loads */
export const currency = writable<string>('PKR');
export const locale = writable<string>('en-PK');

const moneyFormat = (currencyCode: string, localeCode: string, decimals: number) =>
	new Intl.NumberFormat(localeCode, {
		style: 'currency',
		currency: currencyCode,
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	});

/**
 * Money is an exact decimal string end-to-end. It is only ever turned into a
 * number for display — never for arithmetic.
 */
export const formatMoney = (
	amount: string | number | null | undefined,
	currencyCode = 'PKR'
): string => {
	if (amount === null || amount === undefined || amount === '') return '—';
	const value = typeof amount === 'number' ? amount : Number(amount);
	if (Number.isNaN(value)) return String(amount);
	const decimals = Number.isInteger(value) ? 0 : 2;
	return moneyFormat(currencyCode, 'en-PK', decimals).format(value);
};

/** Compact money for tight figures: 1.2K, 48.3K, 1.4M */
export const formatMoneyCompact = (amount: string | number, currencyCode = 'PKR'): string => {
	const value = typeof amount === 'number' ? amount : Number(amount);
	if (Number.isNaN(value)) return '—';
	return new Intl.NumberFormat('en-PK', {
		style: 'currency',
		currency: currencyCode,
		notation: 'compact',
		maximumFractionDigits: 1
	}).format(value);
};

export const formatNumber = (value: number | string | null | undefined): string => {
	if (value === null || value === undefined) return '—';
	const n = typeof value === 'number' ? value : Number(value);
	if (Number.isNaN(n)) return String(value);
	return new Intl.NumberFormat('en-PK').format(n);
};

export const formatPercent = (value: number, digits = 0): string =>
	`${new Intl.NumberFormat('en-PK', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	}).format(value * 100)}%`;

export const formatDateTime = (value: string | Date | null | undefined): string => {
	if (!value) return '—';
	return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(value)
	);
};

export const formatTime = (value: string | Date | null | undefined): string => {
	if (!value) return '—';
	return new Intl.DateTimeFormat('en-PK', { timeStyle: 'short' }).format(new Date(value));
};

export const formatDate = (value: string | Date | null | undefined): string => {
	if (!value) return '—';
	return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(new Date(value));
};

/** "just now", "4m", "2h", "3d" — the board's language for ticket age. */
export const formatRelative = (value: string | Date | null | undefined): string => {
	if (!value) return '—';
	const then = new Date(value).getTime();
	const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
	if (seconds < 45) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	return formatDate(value);
};

/** Minutes a ticket has been open — the number the kitchen reads from afar. */
export const ageInMinutes = (value: string | Date): number =>
	Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));

/** Age buckets drive the ticket's edge and its state colour. */
export type AgeLevel = 'fresh' | 'working' | 'late' | 'overdue';
export const ageLevel = (minutes: number): AgeLevel =>
	minutes >= 20 ? 'overdue' : minutes >= 10 ? 'late' : minutes >= 5 ? 'working' : 'fresh';

export const initials = (name: string): string =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

export const titleCase = (value: string): string =>
	value
		.toLowerCase()
		.split(/[\s_]+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

/** "PARTIALLY_RECEIVED" → "Partially received" */
export const humanizeEnum = (value: string): string => {
	const lower = value.toLowerCase().replace(/_/g, ' ');
	return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** Add days to a date, returning yyyy-mm-dd — used by report range pickers. */
export const shiftDay = (iso: string, days: number): string => {
	const date = new Date(`${iso}T00:00:00`);
	date.setDate(date.getDate() + days);
	return date.toISOString().slice(0, 10);
};
