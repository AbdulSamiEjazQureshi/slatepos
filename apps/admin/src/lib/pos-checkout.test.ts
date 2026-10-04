import { describe, expect, it, vi } from 'vitest';
import type { OrderDto, CreateOrderInput } from '@roms/contracts/orders';
import { PosCheckout } from './pos-checkout';

const input: CreateOrderInput = {
	type: 'TAKEAWAY',
	items: [{ productId: 'dish', quantity: 1, modifiers: [] }],
	tip: '0'
};
const order = {
	id: 'order',
	number: '001',
	status: 'DRAFT',
	totals: { grandTotal: '174.0000' }
} as OrderDto;
const fixture = () => {
	const api = {
		createOrder: vi.fn().mockResolvedValue(order),
		setOrderStatus: vi.fn().mockResolvedValue({ ...order, status: 'CONFIRMED' }),
		capturePayment: vi.fn().mockResolvedValue({})
	};
	return { api, checkout: new PosCheckout(api) };
};

describe('cashier checkout', () => {
	it('charges the server total including tax and confirms the ticket', async () => {
		const { api, checkout } = fixture();
		await checkout.prepare(input);
		await checkout.pay('CASH');
		expect(api.setOrderStatus).toHaveBeenCalledWith('order', 'CONFIRMED');
		expect(api.capturePayment.mock.calls[0][0]).toMatchObject({
			amount: '174.0000',
			orderId: 'order',
			method: 'CASH'
		});
	});
	it('reuses the exact payment and order when the payment response is lost', async () => {
		const { api, checkout } = fixture();
		api.capturePayment.mockRejectedValueOnce(new TypeError('Network disconnected'));
		await checkout.prepare(input);
		await expect(checkout.pay('CASH')).rejects.toThrow();
		await checkout.prepare(input);
		await checkout.pay('CARD');
		expect(api.createOrder).toHaveBeenCalledTimes(1);
		expect(api.capturePayment.mock.calls[0][0]).toEqual(api.capturePayment.mock.calls[1][0]);
	});
	it('retries order creation with the same input and idempotency key', async () => {
		const { api, checkout } = fixture();
		api.createOrder.mockRejectedValueOnce(new TypeError('Response lost'));
		await expect(checkout.prepare(input)).rejects.toThrow();
		await checkout.prepare({ ...input, tip: '100' });
		expect(api.createOrder.mock.calls[0][0]).toEqual(api.createOrder.mock.calls[1][0]);
	});
	it('confirms a ticket before reporting that it was sent to kitchen', async () => {
		const { api, checkout } = fixture();
		expect((await checkout.send(input)).status).toBe('CONFIRMED');
		expect(api.setOrderStatus).toHaveBeenCalledTimes(1);
		expect(api.capturePayment).not.toHaveBeenCalled();
	});
});
