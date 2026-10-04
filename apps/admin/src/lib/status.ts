import type { StampTone } from './ui/stamp.svelte';
import { humanizeEnum } from './format';

/**
 * One vocabulary for state across every surface. A status always renders as
 * the same word in the same tone, whether it appears on the POS, in the
 * kitchen, or in a report row.
 */
export type StateStyle = { label: string; tone: StampTone };

const style = (label: string, tone: StampTone): StateStyle => ({ label, tone });

const ORDER: Record<string, StateStyle> = {
	DRAFT: style('Draft', 'neutral'),
	CONFIRMED: style('Confirmed', 'slate'),
	PREPARING: style('Preparing', 'amber'),
	READY: style('Ready', 'herb'),
	COMPLETED: style('Completed', 'herb'),
	CANCELLED: style('Cancelled', 'brick'),
	REFUNDED: style('Refunded', 'brick'),
	FAILED: style('Failed', 'brick')
};

const PAYMENT: Record<string, StateStyle> = {
	PENDING: style('Pending', 'neutral'),
	AUTHORIZED: style('Authorised', 'slate'),
	CAPTURED: style('Captured', 'herb'),
	PARTIALLY_REFUNDED: style('Partly refunded', 'amber'),
	REFUNDED: style('Refunded', 'brick'),
	FAILED: style('Failed', 'brick'),
	CANCELLED: style('Cancelled', 'brick')
};

const TABLE: Record<string, StateStyle> = {
	AVAILABLE: style('Available', 'herb'),
	OCCUPIED: style('Occupied', 'brass'),
	RESERVED: style('Reserved', 'slate'),
	CLEANING: style('Cleaning', 'amber'),
	OUT_OF_SERVICE: style('Out of service', 'neutral')
};

const KITCHEN: Record<string, StateStyle> = {
	NEW: style('New', 'brick'),
	PREPARING: style('Preparing', 'amber'),
	READY: style('Ready', 'herb'),
	SERVED: style('Served', 'neutral'),
	VOID: style('Void', 'neutral')
};

const ITEM: Record<string, StateStyle> = {
	PENDING: style('Pending', 'neutral'),
	PREPARING: style('Preparing', 'amber'),
	READY: style('Ready', 'herb'),
	SERVED: style('Served', 'slate'),
	VOID: style('Void', 'brick')
};

const PRODUCT: Record<string, StateStyle> = {
	DRAFT: style('Draft', 'neutral'),
	ACTIVE: style('Active', 'herb'),
	ARCHIVED: style('Archived', 'neutral')
};

const USER: Record<string, StateStyle> = {
	INVITED: style('Invited', 'slate'),
	ACTIVE: style('Active', 'herb'),
	SUSPENDED: style('Suspended', 'amber'),
	DISABLED: style('Disabled', 'neutral')
};

const PURCHASE: Record<string, StateStyle> = {
	DRAFT: style('Draft', 'neutral'),
	ORDERED: style('Ordered', 'slate'),
	PARTIALLY_RECEIVED: style('Partly received', 'amber'),
	RECEIVED: style('Received', 'herb'),
	CANCELLED: style('Cancelled', 'brick')
};

const GENERIC = (value: string): StateStyle => style(humanizeEnum(value), 'neutral');

const MAPS = {
	order: ORDER,
	payment: PAYMENT,
	table: TABLE,
	kitchen: KITCHEN,
	item: ITEM,
	product: PRODUCT,
	user: USER,
	purchase: PURCHASE
};

export type StatusKind = keyof typeof MAPS;

/** Resolve a status value to its shared label + tone. Unknown values degrade to
 *  a neutral humanised label rather than disappearing. */
export const statusStyle = (kind: StatusKind, value: string | null | undefined): StateStyle => {
	if (!value) return style('—', 'neutral');
	return MAPS[kind][value] ?? GENERIC(value);
};

export const orderTone = (value: string): StampTone => statusStyle('order', value).tone;
export const orderLabel = (value: string): string => statusStyle('order', value).label;

/** Which transitions an order may legally make — mirrors the server state
 *  machine so the UI never offers an action the API will reject. */
export const ORDER_NEXT: Record<string, { label: string; status: string }[]> = {
	DRAFT: [{ label: 'Confirm', status: 'CONFIRMED' }],
	CONFIRMED: [{ label: 'Start preparing', status: 'PREPARING' }],
	PREPARING: [{ label: 'Mark ready', status: 'READY' }],
	READY: [{ label: 'Complete', status: 'COMPLETED' }]
};

export const ORDER_CANCELLABLE = ['DRAFT', 'CONFIRMED', 'PREPARING'];

export const KITCHEN_NEXT: Record<string, { label: string; status: string } | null> = {
	NEW: { label: 'Start', status: 'PREPARING' },
	PREPARING: { label: 'Ready', status: 'READY' },
	READY: { label: 'Served', status: 'SERVED' },
	SERVED: null,
	VOID: null
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
	CASH: 'Cash',
	CARD: 'Card',
	BANK_TRANSFER: 'Bank transfer',
	JAZZCASH: 'JazzCash',
	EASYPAISA: 'Easypaisa'
};

export const ORDER_TYPE_LABEL: Record<string, string> = {
	DINE_IN: 'Dine in',
	TAKEAWAY: 'Takeaway',
	PICKUP: 'Pickup',
	DELIVERY: 'Delivery',
	ONLINE: 'Online'
};
