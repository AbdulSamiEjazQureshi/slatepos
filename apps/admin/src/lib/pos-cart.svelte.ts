import type { ProductDto } from '@roms/contracts/catalog';

/**
 * The cart is a ticket in progress. It is deliberately server-shaped: it holds
 * exactly what `POST /orders` expects, so nothing is translated on the way out
 * and the figures the cashier reads are the figures that get charged.
 */

export type CartModifier = {
	modifierOptionId: string;
	name: string;
	priceDelta: string;
	quantity: number;
};

export type CartLine = {
	/** stable client id — lines are keyed by identity, not by index */
	key: string;
	productId: string;
	variantId: string | null;
	name: string;
	imageUrl?: string | null;
	/** unit price before modifiers, as an exact decimal string */
	unitPrice: string;
	quantity: number;
	modifiers: CartModifier[];
	notes: string;
	/** a manual price override, when permitted */
	priceOverride: string | null;
};

export type Discount = { type: 'PERCENT' | 'FIXED'; value: string } | null;

const toMinor = (value: string): number => Math.round(Number(value) * 100);

/** Line identity is client-local; a counter avoids depending on `crypto` being
 *  available outside a secure context. */
let lineSeq = 0;
const nextKey = (): string => `line-${++lineSeq}`;

const fromMinor = (minor: number): string => (minor / 100).toFixed(2);

/** Line total in minor units — modifier deltas are per-unit, so they multiply. */
export const lineTotalMinor = (line: CartLine): number => {
	const unit =
		toMinor(line.priceOverride ?? line.unitPrice) +
		line.modifiers.reduce(
			(sum, modifier) => sum + toMinor(modifier.priceDelta) * modifier.quantity,
			0
		);
	return unit * line.quantity;
};

export class PosCart {
	lines = $state<CartLine[]>([]);
	discount = $state<Discount>(null);
	tipMinor = $state(0);
	orderType = $state<'DINE_IN' | 'TAKEAWAY' | 'PICKUP' | 'DELIVERY' | 'ONLINE'>('DINE_IN');
	tableId = $state<string | null>(null);
	customerId = $state<string | null>(null);
	notes = $state('');
	/** set while a paid ticket is tearing off — the signature moment */
	tearing = $state(false);

	readonly count = $derived(this.lines.reduce((sum, line) => sum + line.quantity, 0));
	readonly subtotalMinor = $derived(
		this.lines.reduce((sum, line) => sum + lineTotalMinor(line), 0)
	);

	readonly discountMinor = $derived.by(() => {
		if (!this.discount) return 0;
		if (this.discount.type === 'PERCENT') {
			// a percent discount is a rate ("0.10"), applied to the subtotal
			const rate = Number(this.discount.value);
			return Math.round(this.subtotalMinor * (Number.isFinite(rate) ? rate : 0));
		}
		return Math.min(toMinor(this.discount.value), this.subtotalMinor);
	});

	/** Display-only; the server recomputes tax from tenant rules and wins. */
	taxRate = $state(0);
	readonly taxMinor = $derived(
		Math.round((this.subtotalMinor - this.discountMinor) * this.taxRate)
	);
	readonly totalMinor = $derived(
		this.subtotalMinor - this.discountMinor + this.taxMinor + this.tipMinor
	);

	readonly isEmpty = $derived(this.lines.length === 0);

	addLine(product: ProductDto, variantId: string | null = null, modifiers: CartModifier[] = []) {
		const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
		const unitPrice = variant?.price ?? product.price;
		const signature = `${product.id}:${variantId ?? ''}:${modifiers
			.map((m) => m.modifierOptionId)
			.sort()
			.join(',')}`;

		const existing = this.lines.find(
			(line) =>
				`${line.productId}:${line.variantId ?? ''}:${line.modifiers
					.map((m) => m.modifierOptionId)
					.sort()
					.join(',')}` === signature && !line.notes
		);
		if (existing) {
			existing.quantity = Math.min(999, existing.quantity + 1);
			return;
		}
		this.lines.push({
			key: nextKey(),
			productId: product.id,
			variantId,
			name: variant ? `${product.name} · ${variant.name}` : product.name,
			unitPrice,
			imageUrl: product.imageUrl,
			quantity: 1,
			modifiers,
			notes: '',
			priceOverride: null
		});
	}

	step(key: string, delta: number) {
		const line = this.lines.find((l) => l.key === key);
		if (!line) return;
		line.quantity = Math.min(999, line.quantity + delta);
		if (line.quantity <= 0) this.remove(key);
	}

	setQuantity(key: string, quantity: number) {
		const line = this.lines.find((l) => l.key === key);
		if (!line) return;
		line.quantity = Math.max(1, Math.min(999, Math.floor(quantity) || 1));
	}

	remove(key: string) {
		this.lines = this.lines.filter((line) => line.key !== key);
	}

	clear() {
		this.lines = [];
		this.discount = null;
		this.tipMinor = 0;
		this.notes = '';
		this.tableId = null;
		this.customerId = null;
	}

	/** The exact body `POST /orders` wants — no field invented, none dropped. */
	toCreateInput(branchId: string | null, idempotencyKey: string) {
		return {
			type: this.orderType,
			...(branchId ? { branchId } : {}),
			tableId: this.orderType === 'DINE_IN' ? this.tableId : null,
			customerId: this.customerId,
			items: this.lines.map((line) => ({
				productId: line.productId,
				...(line.variantId ? { variantId: line.variantId } : {}),
				quantity: line.quantity,
				modifiers: line.modifiers.map((m) => ({
					modifierOptionId: m.modifierOptionId,
					quantity: m.quantity
				})),
				...(line.notes ? { notes: line.notes } : {}),
				...(line.priceOverride ? { priceOverride: line.priceOverride } : {})
			})),
			...(this.discount
				? {
						discount: {
							type: this.discount.type,
							value: this.discount.value,
							reason: 'Counter discount'
						}
					}
				: {}),
			tip: fromMinor(this.tipMinor),
			...(this.notes ? { notes: this.notes } : {}),
			idempotencyKey
		};
	}
}
