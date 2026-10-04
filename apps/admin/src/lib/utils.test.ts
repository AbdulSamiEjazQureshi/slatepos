import { describe, expect, test } from 'vitest';
import { cn, formatDateTime, formatMoney } from './utils';

describe('ui utils', () => {
	test('cn merges conflicting tailwind classes', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
		expect(cn('text-slate-200', undefined, 'font-bold')).toBe('text-slate-200 font-bold');
	});

	test('formatMoney renders a currency string', () => {
		const formatted = formatMoney('1050.0000', 'PKR', 'en-PK');
		expect(formatted).toContain('1,050');
	});

	test('formatDateTime tolerates null', () => {
		expect(formatDateTime(null)).toBe('—');
	});
});
