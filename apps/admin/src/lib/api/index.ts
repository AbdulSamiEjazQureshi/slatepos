import type { ProductDto } from '@roms/contracts/catalog';
import type { KitchenTicketStatus, OrderItemStatus, OrderStatus } from '@roms/contracts/enums';
import type { CreateOrderInput, OrderDto } from '@roms/contracts/orders';
import type { CreatePaymentInput, PaymentDto } from '@roms/contracts/payments';
import { eden, unwrap } from './client';

/**
 * A key that makes a write safe to retry. Module-local rather than random so
 * it stays deterministic inside a single session, which is all the API needs
 * to collapse a double-tap into one row.
 */
let keySeq = 0;
export const idempotencyKey = (prefix: string): string =>
	`${prefix}-${Date.now().toString(36)}-${(keySeq += 1).toString(36)}`;

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

/** The delivery lifecycle, in the order a dispatch board advances it. */
export type DeliveryStatus =
	'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export type Courier = {
	id: string;
	name: string;
	phone: string | null;
	vehicle: string | null;
	/** A rate, not a percent: `0.15` is fifteen per cent. */
	commissionRate: string;
	isActive: boolean;
	createdAt: string | Date;
	updatedAt: string | Date;
};

export type Zone = {
	id: string;
	branchId: string;
	name: string;
	fee: string;
	minOrder: string;
	isActive: boolean;
};

export type RecipeStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type RecipeLineInput = {
	componentProductId: string;
	/** A quantity as a decimal string, up to four places. */
	quantity: string;
	unit?: string;
	/** A rate, not a percent: `0.1000` is ten per cent lost in the making. */
	wastageRate?: string;
	unitCost?: string;
};

export type ProductListParams = {
	q?: string;
	page?: number;
	pageSize?: number;
	categoryId?: string;
	sort?: 'name' | 'price' | 'createdAt';
	order?: 'asc' | 'desc';
	/** Sent as a real boolean. Never pass "false" as a string — the route
	 *  coerces with `z.coerce.boolean()`, where Boolean("false") === true. */
	isAvailable?: boolean;
	status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
};

export type OrderListParams = {
	status?: OrderStatus;
	customerId?: string;
	branchId?: string;
	page?: number;
	pageSize?: number;
};

/** List queries carry required defaults in the schema, so fill them in here. */
const listQuery = (params: { page?: number; pageSize?: number } = {}) => ({
	page: params.page ?? 1,
	pageSize: params.pageSize ?? 25,
	order: 'desc' as const
});

/**
 * Feature-level API functions built on the Eden Treaty client. Every call is
 * typed end-to-end from the Elysia route schemas — no hand-written interfaces.
 */
export const api = {
	// --- catalog ------------------------------------------------------------
	listProducts: async (params: ProductListParams = {}) =>
		unwrap(
			await eden.api.v1.products.get({
				query: {
					...listQuery(params),
					...(params.sort ? { sort: params.sort } : {}),
					...(params.order ? { order: params.order } : {}),
					...(params.q ? { q: params.q } : {}),
					...(params.categoryId ? { categoryId: params.categoryId } : {}),
					...(params.status ? { status: params.status } : {}),
					...(params.isAvailable === undefined ? {} : { isAvailable: params.isAvailable })
				}
			})
		),
	getProduct: async (id: string) => unwrap(await eden.api.v1.products({ id }).get()),
	createProduct: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.products.post(body as never)),
	updateProduct: async (id: string, body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.products({ id }).patch(body as never)),
	deleteProduct: async (id: string) => unwrap(await eden.api.v1.products({ id }).delete()),
	searchProducts: async (q: string, limit = 20) =>
		unwrap(await eden.api.v1.products.search.get({ query: { q, limit } })),
	categories: async () =>
		unwrap(await eden.api.v1.categories.get({ query: listQuery({ pageSize: 100 }) })),
	createCategory: async (body: { name: string; description?: string; sortOrder?: number }) =>
		unwrap(await eden.api.v1.categories.post(body as never)),
	updateCategory: async (id: string, body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.categories({ id }).patch(body as never)),
	deleteCategory: async (id: string) => unwrap(await eden.api.v1.categories({ id }).delete()),

	// --- orders -------------------------------------------------------------
	listOrders: async (params: OrderListParams = {}) =>
		unwrap(
			await eden.api.v1.orders.get({
				query: {
					...listQuery(params),
					...(params.status ? { status: params.status } : {}),
					...(params.customerId ? { customerId: params.customerId } : {}),
					...(params.branchId ? { branchId: params.branchId } : {})
				}
			})
		),
	getOrder: async (id: string) => unwrap(await eden.api.v1.orders({ id }).get()),
	createOrder: async (body: CreateOrderInput) => unwrap(await eden.api.v1.orders.post(body)),
	updateOrder: async (id: string, body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.orders({ id }).patch(body as never)),
	setOrderStatus: async (orderId: string, status: OrderStatus, reason?: string) =>
		unwrap(
			await eden.api.v1
				.orders({ id: orderId })
				.status.post({ status, ...(reason ? { reason } : {}) })
		),
	setOrderItemStatus: async (orderId: string, itemId: string, status: OrderItemStatus) =>
		unwrap(await eden.api.v1.orders({ id: orderId }).items({ itemId }).status.post({ status })),

	// --- payments -----------------------------------------------------------
	listPayments: async (params: { page?: number; pageSize?: number } = {}) =>
		unwrap(await eden.api.v1.payments.get({ query: listQuery(params) })),
	capturePayment: async (body: CreatePaymentInput) => unwrap(await eden.api.v1.payments.post(body)),
	refundPayment: async (
		id: string,
		body: { amount?: string; reason?: string; idempotencyKey: string }
	) => unwrap(await eden.api.v1.payments({ id }).refund.post(body as never)),
	cashMovement: async (body: {
		branchId: string;
		direction: 'IN' | 'OUT';
		amount: string;
		reason: string;
	}) => unwrap(await eden.api.v1.payments['cash-movements'].post(body as never)),

	// --- inventory ----------------------------------------------------------
	listStock: async (params: { lowOnly?: boolean; q?: string; pageSize?: number } = {}) =>
		unwrap(
			await eden.api.v1.inventory.stock.get({
				query: {
					...listQuery({ pageSize: params.pageSize ?? 50 }),
					...(params.lowOnly ? { lowOnly: true } : {}),
					...(params.q ? { q: params.q } : {})
				}
			})
		),
	listMovements: async (params: { productId?: string; pageSize?: number } = {}) =>
		unwrap(
			await eden.api.v1.inventory.movements.get({
				query: {
					...listQuery({ pageSize: params.pageSize ?? 40 }),
					...(params.productId ? { productId: params.productId } : {})
				}
			})
		),
	adjustStock: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.inventory.adjust.post(body as never)),
	transferStock: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.inventory.transfer.post(body as never)),

	// --- tables & floor -----------------------------------------------------
	// Floors are mounted under the tables prefix — there is no /api/v1/floors.
	listFloors: async (params: { branchId?: string } = {}) =>
		unwrap(
			await eden.api.v1.tables.floors.get({
				query: params.branchId ? { branchId: params.branchId } : {}
			})
		),
	createFloor: async (body: { name: string; branchId?: string; sortOrder?: number }) =>
		unwrap(await eden.api.v1.tables.floors.post(body as never)),
	listTables: async (params: { branchId?: string } = {}) =>
		unwrap(
			await eden.api.v1.tables.get({ query: params.branchId ? { branchId: params.branchId } : {} })
		),
	createTable: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.tables.post(body as never)),
	updateTable: async (id: string, body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.tables({ id }).patch(body as never)),
	setTableStatus: async (id: string, status: string, orderId?: string | null) =>
		unwrap(
			await eden.api.v1.tables({ id }).status.post({
				status,
				...(orderId !== undefined ? { orderId } : {})
			} as never)
		),
	listReservations: async (params: { branchId?: string } = {}) =>
		unwrap(
			await eden.api.v1.tables.reservations.get({
				query: params.branchId ? { branchId: params.branchId } : {}
			})
		),
	createReservation: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.tables.reservations.post(body as never)),
	transferTable: async (fromTableId: string, toTableId: string) =>
		unwrap(await eden.api.v1.tables.transfer.post({ fromTableId, toTableId })),
	/** Split merges off a primary table and returns them to service. */
	splitTable: async (primaryTableId: string) =>
		unwrap(await eden.api.v1.tables.split.post({ primaryTableId })),
	mergeTables: async (primaryTableId: string, mergedTableIds: string[]) =>
		unwrap(await eden.api.v1.tables.merge.post({ primaryTableId, mergedTableIds })),

	// --- kitchen (KDS) ------------------------------------------------------
	listStations: async () => unwrap(await eden.api.v1.kitchen.stations.get()),
	createStation: async (body: { name: string; sortOrder?: number }) =>
		unwrap(await eden.api.v1.kitchen.stations.post(body as never)),
	listKitchenTickets: async (params: { branchId?: string; status?: KitchenTicketStatus } = {}) =>
		unwrap(
			await eden.api.v1.kitchen.tickets.get({
				query: {
					...(params.branchId ? { branchId: params.branchId } : {}),
					...(params.status ? { status: params.status } : {})
				}
			})
		),
	setKitchenTicketStatus: async (ticketId: string, status: KitchenTicketStatus) =>
		unwrap(await eden.api.v1.kitchen.tickets({ id: ticketId }).status.post({ status })),
	setTicketPriority: async (ticketId: string, priority: number) =>
		unwrap(
			await eden.api.v1.kitchen.tickets({ id: ticketId }).priority.post({ priority } as never)
		),

	// --- customers ----------------------------------------------------------
	listCustomers: async (params: { q?: string; group?: string; pageSize?: number } = {}) =>
		unwrap(
			await eden.api.v1.customers.get({
				query: {
					...listQuery({ pageSize: params.pageSize ?? 50 }),
					...(params.q ? { q: params.q } : {}),
					...(params.group ? { group: params.group } : {})
				}
			})
		),
	getCustomer: async (id: string) => unwrap(await eden.api.v1.customers({ id }).get()),
	createCustomer: async (body: {
		name: string;
		phone?: string;
		email?: string;
		notes?: string;
		group?: string;
	}) => unwrap(await eden.api.v1.customers.post(body)),
	updateCustomer: async (
		id: string,
		body: Partial<{
			name: string;
			phone: string | null;
			email: string | null;
			notes: string | null;
			group: string | null;
		}>
	) => unwrap(await eden.api.v1.customers({ id }).patch(body as never)),

	// --- reports ------------------------------------------------------------
	salesSeries: async (params: { from: string; to: string; timezone: string }) =>
		unwrap(await eden.api.v1.reports['sales-series'].get({ query: params })),
	salesSummary: async (params: { from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.reports['sales-summary'].get({ query: params })),
	topProducts: async (params: { from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.reports['top-products'].get({ query: params })),
	paymentMethods: async (params: { from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.reports['payment-methods'].get({ query: params })),
	inventoryValuation: async () => unwrap(await eden.api.v1.reports['inventory-valuation'].get()),
	purchaseReport: async (params: { from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.reports.purchases.get({ query: params })),
	taxesReport: async (params: { from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.reports.taxes.get({ query: params })),
	customersReport: async () => unwrap(await eden.api.v1.reports.customers.get()),
	kitchenReport: async (params: { from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.reports.kitchen.get({ query: params })),

	// --- purchasing ---------------------------------------------------------
	listSuppliers: async () =>
		unwrap(await eden.api.v1.purchasing.suppliers.get({ query: listQuery({ pageSize: 100 }) })),
	createSupplier: async (input: {
		name: string;
		contactName?: string;
		phone?: string;
		email?: string;
		address?: string;
		paymentTermsDays?: number;
	}) =>
		unwrap(
			await eden.api.v1.purchasing.suppliers.post({
				name: input.name,
				paymentTermsDays: input.paymentTermsDays ?? 0,
				...(input.contactName ? { contactName: input.contactName } : {}),
				...(input.phone ? { phone: input.phone } : {}),
				...(input.email ? { email: input.email } : {}),
				...(input.address ? { address: input.address } : {})
			})
		),
	updateSupplier: async (id: string, body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.purchasing.suppliers({ id }).patch(body as never)),
	supplierLedger: async (supplierId: string) =>
		unwrap(await eden.api.v1.purchasing.suppliers({ id: supplierId }).ledger.get()),
	paySupplier: async (body: {
		supplierId: string;
		amount: string;
		method?: string;
		reference?: string;
		idempotencyKey: string;
	}) => unwrap(await eden.api.v1.purchasing.suppliers.payments.post(body as never)),
	listPurchaseOrders: async (params: { status?: string } = {}) =>
		unwrap(
			await eden.api.v1.purchasing['purchase-orders'].get({
				query: {
					...listQuery({ pageSize: 100 }),
					...(params.status ? { status: params.status } : {})
				}
			})
		),
	createPurchaseOrder: async (input: {
		supplierId: string;
		branchId?: string;
		expectedDate?: string;
		notes?: string;
		items: { productId: string; quantity: number; unitCost: string }[];
	}) =>
		unwrap(
			await eden.api.v1.purchasing['purchase-orders'].post({
				supplierId: input.supplierId,
				...(input.branchId ? { branchId: input.branchId } : {}),
				// The route wants a full offset datetime, not a bare date.
				...(input.expectedDate ? { expectedDate: input.expectedDate } : {}),
				...(input.notes ? { notes: input.notes } : {}),
				items: input.items.map((item) => ({ ...item, taxRate: '0' }))
			})
		),
	getPurchaseOrder: async (id: string) =>
		unwrap(await eden.api.v1.purchasing['purchase-orders']({ id }).get()),
	setPurchaseOrderStatus: async (id: string, status: string) =>
		unwrap(
			await eden.api.v1.purchasing['purchase-orders']({ id }).status.post({ status } as never)
		),
	receivePurchaseOrder: async (
		id: string,
		items: { purchaseOrderItemId: string; quantity: number }[]
	) => unwrap(await eden.api.v1.purchasing['purchase-orders']({ id }).receive.post({ items })),

	// --- recipes ------------------------------------------------------------
	/** Unpaginated and unbounded: every version of every recipe comes back. */
	listRecipes: async (params: { productId?: string } = {}) =>
		unwrap(
			await eden.api.v1.recipes.get({
				query: params.productId ? { productId: params.productId } : {}
			})
		),
	/** The bare list rows carry no lines; this is the one that does. */
	getRecipe: async (id: string) => unwrap(await eden.api.v1.recipes({ id }).get()),
	createRecipe: async (body: {
		productId: string;
		name: string;
		yieldQuantity?: string;
		yieldUnit?: string;
		notes?: string;
		items: RecipeLineInput[];
	}) => unwrap(await eden.api.v1.recipes.post(body as never)),
	setRecipeStatus: async (id: string, status: RecipeStatus) =>
		unwrap(await eden.api.v1.recipes({ id }).status.post({ status } as never)),
	/** Consumes ingredient stock and produces the output — needs `inventory.adjust`. */
	produceRecipe: async (id: string, body: { quantity: number; branchId?: string }) =>
		unwrap(await eden.api.v1.recipes({ id }).produce.post(body as never)),
	listProductionRuns: async () => unwrap(await eden.api.v1.recipes.production.runs.get()),

	// --- delivery -----------------------------------------------------------
	/** Zones and riders come back as bare arrays; deliveries are paginated. */
	listZones: async (params: { branchId?: string } = {}) =>
		unwrap(
			await eden.api.v1.delivery.zones.get({
				query: params.branchId ? { branchId: params.branchId } : {}
			})
		),
	createZone: async (body: { branchId: string; name: string; fee?: string; minOrder?: string }) =>
		unwrap(await eden.api.v1.delivery.zones.post(body as never)),
	listRiders: async () => unwrap(await eden.api.v1.delivery.riders.get()),
	createRider: async (body: {
		name: string;
		phone?: string;
		vehicle?: string;
		/** A rate, not a percent: `0.15` is fifteen per cent of the delivery fee. */
		commissionRate?: string;
	}) => unwrap(await eden.api.v1.delivery.riders.post(body as never)),
	listDeliveries: async (
		params: {
			status?: DeliveryStatus;
			riderId?: string;
			branchId?: string;
			page?: number;
			pageSize?: number;
		} = {}
	) =>
		unwrap(
			await eden.api.v1.delivery.deliveries.get({
				query: {
					...listQuery({ pageSize: params.pageSize ?? 100 }),
					...(params.status ? { status: params.status } : {}),
					...(params.riderId ? { riderId: params.riderId } : {}),
					...(params.branchId ? { branchId: params.branchId } : {})
				}
			})
		),
	createDelivery: async (body: {
		orderId: string;
		zoneId?: string;
		address?: string;
		riderId?: string;
		provider?: string;
	}) => unwrap(await eden.api.v1.delivery.deliveries.post(body as never)),
	assignRider: async (id: string, riderId: string) =>
		unwrap(await eden.api.v1.delivery.deliveries({ id }).rider.post({ riderId })),
	setDeliveryStatus: async (id: string, status: DeliveryStatus) =>
		unwrap(await eden.api.v1.delivery.deliveries({ id }).status.post({ status } as never)),
	/** Records a settlement for whatever was delivered inside the window. */
	settleRider: async (body: { riderId: string; periodStart: string; periodEnd: string }) =>
		unwrap(await eden.api.v1.delivery.settlements.post(body as never)),

	// --- workforce ----------------------------------------------------------
	listDepartments: async () => unwrap(await eden.api.v1.workforce.departments.get()),
	createDepartment: async (body: { name: string }) =>
		unwrap(await eden.api.v1.workforce.departments.post(body as never)),
	listEmployees: async (params: { q?: string; branchId?: string; pageSize?: number } = {}) =>
		unwrap(
			await eden.api.v1.workforce.employees.get({
				query: {
					...listQuery({ pageSize: params.pageSize ?? 100 }),
					...(params.q ? { q: params.q } : {}),
					...(params.branchId ? { branchId: params.branchId } : {})
				}
			})
		),
	createEmployee: async (body: {
		fullName: string;
		branchId?: string;
		departmentId?: string;
		phone?: string;
		position?: string;
		hireDate?: string;
		salaryType?: 'MONTHLY' | 'DAILY' | 'HOURLY';
		salaryAmount?: string;
		commissionRate?: string;
	}) => unwrap(await eden.api.v1.workforce.employees.post(body as never)),
	updateEmployee: async (
		id: string,
		body: Partial<{
			fullName: string;
			branchId: string | null;
			departmentId: string | null;
			phone: string;
			position: string;
			hireDate: string | null;
			salaryType: 'MONTHLY' | 'DAILY' | 'HOURLY';
			salaryAmount: string;
			commissionRate: string;
			status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
		}>
	) => unwrap(await eden.api.v1.workforce.employees({ id }).patch(body as never)),
	employeeLedger: async (id: string) =>
		unwrap(await eden.api.v1.workforce.employees({ id }).ledger.get()),
	/** Capped server-side at 500 rows with no pagination — pass a window. */
	listAttendance: async (params: { employeeId?: string; from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.workforce.attendance.get({ query: params })),
	recordAttendance: async (body: {
		employeeId: string;
		workDate: string;
		status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY';
		source?: 'MANUAL' | 'BIOMETRIC';
		checkIn?: string;
		checkOut?: string;
		notes?: string;
	}) => unwrap(await eden.api.v1.workforce.attendance.post(body as never)),
	/** Also capped at 500, and `from`/`to` filter on `startAt` alone. */
	listShifts: async (params: { from?: string; to?: string } = {}) =>
		unwrap(await eden.api.v1.workforce.shifts.get({ query: params })),
	createShift: async (body: {
		employeeId: string;
		branchId?: string;
		startAt: string;
		endAt: string;
		role?: string;
	}) => unwrap(await eden.api.v1.workforce.shifts.post(body as never)),
	requestLeave: async (body: {
		employeeId: string;
		fromDate: string;
		toDate: string;
		type?: string;
		reason?: string;
	}) => unwrap(await eden.api.v1.workforce.leaves.post(body as never)),
	setLeaveStatus: async (id: string, status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED') =>
		unwrap(await eden.api.v1.workforce.leaves({ id }).status.post({ status } as never)),
	createAdvance: async (body: { employeeId: string; amount: string; reason?: string }) =>
		unwrap(await eden.api.v1.workforce.advances.post(body as never)),

	// --- promotions ---------------------------------------------------------
	/** Unpaginated and unbounded — the whole set comes back every time. */
	listPromotions: async () => unwrap(await eden.api.v1.promotions.get()),
	createPromotion: async (body: {
		name: string;
		type?: 'PERCENT' | 'FIXED' | 'BOGO';
		/** A rate, not a percent: `0.10` is 10%. */
		value: string;
		code?: string;
		minOrder?: string;
		maxDiscount?: string;
		branchIds?: string[];
		productIds?: string[];
		categoryIds?: string[];
		customerGroup?: string;
		usageLimit?: number;
		/** Full offset datetimes. */
		startDate?: string;
		endDate?: string;
		isActive?: boolean;
	}) => unwrap(await eden.api.v1.promotions.post(body as never)),
	updatePromotion: async (
		id: string,
		body: Partial<{
			name: string;
			type: 'PERCENT' | 'FIXED' | 'BOGO';
			value: string;
			code: string | null;
			minOrder: string;
			maxDiscount: string | null;
			branchIds: string[];
			productIds: string[];
			categoryIds: string[];
			customerGroup: string | null;
			usageLimit: number | null;
			startDate: string | null;
			endDate: string | null;
			isActive: boolean;
		}>
	) => unwrap(await eden.api.v1.promotions({ id }).patch(body as never)),

	// --- accounting ---------------------------------------------------------
	/** The GET seeds the chart of accounts as a side effect, so it doubles as setup. */
	listAccounts: async () => unwrap(await eden.api.v1.accounting.accounts.get()),
	seedAccounts: async () => unwrap(await eden.api.v1.accounting.accounts.seed.post({} as never)),
	listExpenses: async (params: { category?: string; pageSize?: number } = {}) =>
		unwrap(
			await eden.api.v1.accounting.expenses.get({
				query: {
					...listQuery({ pageSize: params.pageSize ?? 100 }),
					// `category` is matched exactly and never trimmed — send it clean.
					...(params.category ? { category: params.category } : {})
				}
			})
		),
	createExpense: async (body: {
		category: string;
		amount: string;
		/** `YYYY-MM-DD` — the column is a date, so a full timestamp compares wrongly. */
		expenseDate: string;
		note?: string;
		paidFrom?: 'CASH' | 'BANK';
		branchId?: string;
	}) => unwrap(await eden.api.v1.accounting.expenses.post(body as never)),
	/** Returns at most 100 entries and carries no account name — join on `accountId`. */
	listJournal: async () => unwrap(await eden.api.v1.accounting.journal.get()),
	openCashSession: async (body: { branchId: string; openingFloat?: string }) =>
		unwrap(await eden.api.v1.accounting['cash-sessions'].post(body as never)),
	closeCashSession: async (id: string, countedCash: string) =>
		unwrap(
			await eden.api.v1.accounting['cash-sessions']({ id }).close.post({ countedCash } as never)
		),
	dailyClosing: async (branchId: string, businessDate: string) =>
		unwrap(await eden.api.v1.accounting['daily-closing'].post({ branchId, businessDate })),
	/** Hard-capped at 60 rows server-side, newest first. */
	listDailyClosings: async (branchId?: string) =>
		unwrap(
			await eden.api.v1.accounting['daily-closings'].get({
				query: branchId ? { branchId } : {}
			})
		),
	/** Both dates are REQUIRED and must be bare `YYYY-MM-DD`, not ISO instants. */
	profitLoss: async (from: string, to: string) =>
		unwrap(await eden.api.v1.accounting['profit-loss'].get({ query: { from, to } })),

	// --- admin / system -----------------------------------------------------
	listAuditLogs: async (params: { page?: number; pageSize?: number } = {}) =>
		unwrap(await eden.api.v1['audit-logs'].get({ query: listQuery(params) })),
	listUsers: async (params: { q?: string; status?: UserStatus; pageSize?: number } = {}) =>
		unwrap(
			await eden.api.v1.users.get({
				query: {
					...listQuery({ pageSize: params.pageSize ?? 100 }),
					...(params.q ? { q: params.q } : {}),
					...(params.status ? { status: params.status } : {})
				}
			})
		),
	createUser: async (body: {
		email: string;
		fullName: string;
		password: string;
		roles?: string[];
		branchIds?: string[];
		status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
	}) => unwrap(await eden.api.v1.users.post(body as never)),
	updateUser: async (
		id: string,
		body: Partial<{
			fullName: string;
			status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
			/** Replaces the whole set — it does not merge. */
			roles: string[];
			branchIds: string[];
		}>
	) => unwrap(await eden.api.v1.users({ id }).patch(body as never)),
	listRoles: async () =>
		unwrap(await eden.api.v1.roles.get({ query: listQuery({ pageSize: 50 }) })),
	createRole: async (body: { name: string; description?: string; permissions?: string[] }) =>
		unwrap(await eden.api.v1.roles.post(body as never)),
	updateRole: async (
		id: string,
		body: Partial<{ name: string; description: string; permissions: string[] }>
	) => unwrap(await eden.api.v1.roles({ id }).patch(body as never)),
	listBranches: async () =>
		unwrap(await eden.api.v1.branches.get({ query: listQuery({ pageSize: 50 }) })),
	createBranch: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.branches.post(body as never)),
	updateBranch: async (id: string, body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.branches({ id }).patch(body as never)),
	currentTenant: async () => unwrap(await eden.api.v1.tenants.current.get()),
	updateCurrentTenant: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.tenants.current.patch(body as never)),
	websiteSettings: async () => unwrap(await eden.api.v1.website.settings.get()),
	updateWebsiteSettings: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.website.settings.patch(body as never)),

	// --- integrations & ai --------------------------------------------------
	listNotifications: async () => unwrap(await eden.api.v1.integrations.notifications.get()),
	markNotificationRead: async (id: string) =>
		unwrap(await eden.api.v1.integrations.notifications({ id }).read.post({} as never)),
	listTaxInvoices: async () => unwrap(await eden.api.v1.integrations['tax-invoices'].get()),
	listWebhooks: async () => unwrap(await eden.api.v1.integrations.webhooks.get()),
	askAi: async (message: string, conversationId?: string) =>
		unwrap(
			await eden.api.v1.ai.query.post(conversationId ? { message, conversationId } : { message })
		),
	aiTools: async () => unwrap(await eden.api.v1.ai.tools.get()),
	aiConversations: async () => unwrap(await eden.api.v1.ai.conversations.get()),

	// --- auth extras --------------------------------------------------------
	listSessions: async () => unwrap(await eden.api.v1.auth.sessions.get()),
	revokeSession: async (id: string) => unwrap(await eden.api.v1.auth.sessions({ id }).delete()),
	forgotPassword: async (email: string) =>
		unwrap(await eden.api.v1.auth.password.forgot.post({ email })),
	resetPassword: async (token: string, password: string) =>
		unwrap(await eden.api.v1.auth.password.reset.post({ token, password })),
	requestOtp: async (identifier: string, purpose: string) =>
		unwrap(await eden.api.v1.auth.otp.request.post({ identifier, purpose } as never)),
	verifyOtp: async (identifier: string, code: string, purpose: string) =>
		unwrap(await eden.api.v1.auth.otp.verify.post({ identifier, code, purpose } as never)),
	registerTenant: async (body: Record<string, unknown>) =>
		unwrap(await eden.api.v1.auth.register.post(body as never))
};

export type { ProductDto, OrderDto, PaymentDto };
