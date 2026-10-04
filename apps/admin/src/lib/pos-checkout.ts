import type { CreateOrderInput, OrderDto } from '@roms/contracts/orders';
import type { CreatePaymentInput } from '@roms/contracts/payments';

type CheckoutApi = {
	createOrder(input: CreateOrderInput): Promise<OrderDto>;
	setOrderStatus(id: string, status: 'CONFIRMED'): Promise<OrderDto>;
	capturePayment(input: CreatePaymentInput): Promise<unknown>;
};

/** Preserve identity across retries, including a lost HTTP response. */
export class PosCheckout {
	private orderKey = crypto.randomUUID();
	private paymentKey = crypto.randomUUID();
	private input: CreateOrderInput | null = null;
	private order: OrderDto | null = null;
	private payment: CreatePaymentInput | null = null;
	constructor(private api: CheckoutApi) {}

	get hasOrder(): boolean {
		return this.order !== null;
	}

	async prepare(input: CreateOrderInput): Promise<OrderDto> {
		this.input ??= { ...input, idempotencyKey: this.orderKey };
		this.order ??= await this.api.createOrder(this.input);
		return this.order;
	}

	async send(input: CreateOrderInput): Promise<OrderDto> {
		const order = await this.prepare(input);
		if (order.status === 'DRAFT') this.order = await this.api.setOrderStatus(order.id, 'CONFIRMED');
		return this.order!;
	}

	async pay(method: CreatePaymentInput['method']): Promise<OrderDto> {
		if (!this.order) throw new Error('Review the ticket before taking payment');
		if (this.order.status === 'DRAFT')
			this.order = await this.api.setOrderStatus(this.order.id, 'CONFIRMED');
		// Once attempted, keep the identical payment body until its outcome is known.
		this.payment ??= {
			orderId: this.order.id,
			method,
			amount: this.order.totals.grandTotal,
			idempotencyKey: this.paymentKey
		};
		await this.api.capturePayment(this.payment);
		return this.order;
	}

	reset(): void {
		this.input = null;
		this.order = null;
		this.payment = null;
		this.orderKey = crypto.randomUUID();
		this.paymentKey = crypto.randomUUID();
	}
}
