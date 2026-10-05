<script lang="ts">
	import SelectField from '#lib/ui/select-field.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api, idempotencyKey } from '#lib/api';
	import { authenticated, branchId } from '#lib/session';
	import { formatMoney, formatNumber, formatRelative, humanizeEnum } from '#lib/format';
	import type { ProductDto } from '#lib/api';
	import PageHead from '#lib/ui/page-head.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Button from '#lib/ui/button.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Modal from '#lib/ui/modal.svelte';
	import Field from '#lib/ui/field.svelte';
	import FormSection from '#lib/ui/form-section.svelte';
	import Figure from '#lib/ui/figure.svelte';
	import Truck from '@lucide/svelte/icons/truck';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import PackageCheck from '@lucide/svelte/icons/package-check';
	import Banknote from '@lucide/svelte/icons/banknote';
	import Minus from '@lucide/svelte/icons/minus';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const queryClient = useQueryClient();

	let tab = $state<'orders' | 'suppliers'>('orders');
	let statusFilter = $state<string>('ALL');

	const suppliers = createQuery(() => ({
		queryKey: ['purchasing', 'suppliers'],
		queryFn: () => api.listSuppliers(),
		enabled: $authenticated
	}));

	const orders = createQuery(() => ({
		queryKey: ['purchasing', 'orders'],
		queryFn: () => api.listPurchaseOrders(),
		enabled: $authenticated
	}));

	const products = createQuery(() => ({
		queryKey: ['catalog', 'products', 'active'],
		queryFn: () => api.listProducts({ pageSize: 200, status: 'ACTIVE' }),
		enabled: $authenticated
	}));

	const supplierRows = $derived(suppliers.data?.items ?? []);
	const productRows = $derived(products.data?.items ?? []);

	const poRows = $derived.by(() => {
		const items = orders.data?.items ?? [];
		if (statusFilter === 'ALL') return items;
		return items.filter((order) => order.status === statusFilter);
	});

	const owed = $derived.by(() => {
		// Only what is still outstanding: ordered and not yet fully received.
		return poRows
			.filter((order) => ['ORDERED', 'PARTIALLY_RECEIVED', 'DRAFT'].includes(order.status))
			.reduce((sum, order) => sum + Math.round(Number(order.total) * 100), 0);
	});

	const supplierName = (id: string) => supplierRows.find((row) => row.id === id)?.name ?? 'Unknown';
	const productName = (id: string) =>
		productRows.find((row) => row.id === id)?.name ?? id.slice(0, 8);

	// ── supplier ledger ───────────────────────────────────────────────────
	let ledgerFor = $state<{ id: string; name: string } | null>(null);
	const ledger = createQuery(() => ({
		queryKey: ['purchasing', 'ledger', ledgerFor?.id],
		queryFn: () => api.supplierLedger(ledgerFor?.id as string),
		enabled: $authenticated && Boolean(ledgerFor)
	}));

	let payOpen = $state(false);
	let payAmount = $state('');
	let payMethod = $state('CASH');
	let payReference = $state('');
	let paying = $state(false);

	const openPay = () => {
		payAmount = '';
		payMethod = 'CASH';
		payReference = '';
		payOpen = true;
	};

	const pay = async () => {
		if (!ledgerFor) return;
		paying = true;
		try {
			await api.paySupplier({
				supplierId: ledgerFor.id,
				amount: payAmount,
				method: payMethod,
				...(payReference ? { reference: payReference } : {}),
				idempotencyKey: idempotencyKey('sup-pay')
			});
			await queryClient.invalidateQueries({ queryKey: ['purchasing'] });
			toast.success(`${formatMoney(payAmount)} paid to ${ledgerFor.name}`);
			payOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not record the payment');
		} finally {
			paying = false;
		}
	};

	// ── new supplier ──────────────────────────────────────────────────────
	let supplierOpen = $state(false);
	let savingSupplier = $state(false);
	let supplierForm = $state({
		name: '',
		contactName: '',
		phone: '',
		email: '',
		address: '',
		paymentTermsDays: 0
	});

	const openSupplier = () => {
		supplierForm = {
			name: '',
			contactName: '',
			phone: '',
			email: '',
			address: '',
			paymentTermsDays: 0
		};
		supplierOpen = true;
	};

	const addSupplier = async () => {
		savingSupplier = true;
		try {
			await api.createSupplier({
				name: supplierForm.name.trim(),
				...(supplierForm.contactName ? { contactName: supplierForm.contactName } : {}),
				...(supplierForm.phone ? { phone: supplierForm.phone } : {}),
				...(supplierForm.email ? { email: supplierForm.email } : {}),
				...(supplierForm.address ? { address: supplierForm.address } : {}),
				paymentTermsDays: supplierForm.paymentTermsDays
			});
			await queryClient.invalidateQueries({ queryKey: ['purchasing'] });
			toast.success(`${supplierForm.name} added`);
			supplierOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not add the supplier');
		} finally {
			savingSupplier = false;
		}
	};

	// ── new purchase order ────────────────────────────────────────────────
	let poOpen = $state(false);
	let savingPo = $state(false);
	let poSupplier = $state('');
	let poExpected = $state('');
	let poNotes = $state('');
	let poLines = $state<{ productId: string; name: string; quantity: number; unitCost: string }[]>(
		[]
	);
	let poQuery = $state('');

	const openPo = () => {
		poSupplier = supplierRows[0]?.id ?? '';
		poExpected = '';
		poNotes = '';
		poLines = [];
		poQuery = '';
		poOpen = true;
	};

	const poTotal = $derived(
		poLines.reduce(
			(sum, line) => sum + Math.round(Number(line.unitCost || '0') * 100) * line.quantity,
			0
		)
	);

	const poCandidates = $derived.by(() => {
		const needle = poQuery.trim().toLowerCase();
		return productRows
			.filter((product: ProductDto) => !poLines.some((line) => line.productId === product.id))
			.filter((product: ProductDto) => !needle || product.name.toLowerCase().includes(needle))
			.slice(0, 8);
	});

	const addPoLine = (product: ProductDto) => {
		poLines = [
			...poLines,
			{
				productId: product.id,
				name: product.name,
				quantity: 1,
				unitCost: product.costPrice ?? '0'
			}
		];
		poQuery = '';
	};

	const createPo = async () => {
		if (!poSupplier || poLines.length === 0) return;
		savingPo = true;
		// Read once: the session store is null until a branch is chosen, and the
		// API wants the field absent rather than null when it is.
		const branch = $branchId;
		try {
			const result = await api.createPurchaseOrder({
				supplierId: poSupplier,
				...(branch ? { branchId: branch } : {}),
				// A date input gives `2026-10-09`; the route wants a full datetime.
				...(poExpected ? { expectedDate: `${poExpected}T12:00:00.000Z` } : {}),
				...(poNotes ? { notes: poNotes } : {}),
				items: poLines.map((line) => ({
					productId: line.productId,
					quantity: line.quantity,
					unitCost: line.unitCost || '0'
				}))
			});
			await queryClient.invalidateQueries({ queryKey: ['purchasing'] });
			toast.success(`${result.number} raised`);
			poOpen = false;
			tab = 'orders';
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not raise the order');
		} finally {
			savingPo = false;
		}
	};

	// ── order actions ─────────────────────────────────────────────────────
	const setStatus = async (id: string, status: 'ORDERED' | 'CANCELLED') => {
		try {
			await api.setPurchaseOrderStatus(id, status);
			await queryClient.invalidateQueries({ queryKey: ['purchasing'] });
			toast.success(status === 'ORDERED' ? 'Sent to the supplier' : 'Order cancelled');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not change the order');
		}
	};

	// ── receiving ─────────────────────────────────────────────────────────
	let receiveFor = $state<string | null>(null);
	const receiving = createQuery(() => ({
		queryKey: ['purchasing', 'order', receiveFor],
		queryFn: () => api.getPurchaseOrder(receiveFor as string),
		enabled: $authenticated && Boolean(receiveFor)
	}));

	let received = $state<Record<string, number>>({});
	let receivingBusy = $state(false);

	const openReceive = (id: string) => {
		received = {};
		receiveFor = id;
	};

	const confirmReceive = async () => {
		if (!receiveFor || !receiving.data) return;
		const items = Object.entries(received)
			.filter(([, qty]) => qty > 0)
			.map(([purchaseOrderItemId, quantity]) => ({ purchaseOrderItemId, quantity }));
		if (items.length === 0) {
			toast.info('Nothing marked as received');
			return;
		}
		receivingBusy = true;
		try {
			await api.receivePurchaseOrder(receiveFor, items);
			await queryClient.invalidateQueries({ queryKey: ['purchasing'] });
			await queryClient.invalidateQueries({ queryKey: ['inventory'] });
			toast.success('Goods booked into stock');
			receiveFor = null;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not book in the goods');
		} finally {
			receivingBusy = false;
		}
	};

	const PO_TONE: Record<string, 'neutral' | 'slate' | 'amber' | 'herb' | 'brick'> = {
		DRAFT: 'neutral',
		ORDERED: 'slate',
		PARTIALLY_RECEIVED: 'amber',
		RECEIVED: 'herb',
		CANCELLED: 'brick'
	};
</script>

<svelte:head><title>Purchasing — ROMS</title></svelte:head>

<PageHead title="Purchasing" sub="Manage purchase orders, receiving and suppliers.">
	{#snippet actions()}
		<Button variant="outline" size="sm" onclick={openSupplier}>
			<Plus size={14} />
			Supplier
		</Button>
		<Button size="sm" onclick={openPo} disabled={supplierRows.length === 0}>
			<Plus size={14} />
			Raise an order
		</Button>
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
	<Figure
		label="Open orders"
		value={orders.isPending
			? '—'
			: formatNumber(
					poRows.filter((o) => o.status !== 'RECEIVED' && o.status !== 'CANCELLED').length
				)}
		sub="Raised and not yet fully received"
	/>
	<Figure
		label="On order"
		value={orders.isPending ? '—' : formatMoney(String(owed / 100))}
		sub="Committed to suppliers, not yet in stock"
	/>
	<Figure
		label="Suppliers"
		value={suppliers.isPending ? '—' : formatNumber(supplierRows.length)}
		sub="Everyone on the books"
	/>
</div>

<Plate class="mt-4 overflow-hidden">
	<PlateHead
		title={tab === 'orders' ? 'Purchase orders' : 'Suppliers'}
		sub={tab === 'orders' ? 'Raised, sent and received' : 'Who you buy from, and what you owe'}
	>
		{#snippet actions()}
			<div class="border-line flex rounded-sm border p-0.5">
				<button
					type="button"
					class="chip h-7 rounded-xs px-2.5 text-xs"
					aria-pressed={tab === 'orders'}
					onclick={() => (tab = 'orders')}
				>
					Orders
				</button>
				<button
					type="button"
					class="chip h-7 rounded-xs px-2.5 text-xs"
					aria-pressed={tab === 'suppliers'}
					onclick={() => (tab = 'suppliers')}
				>
					Suppliers
				</button>
			</div>
		{/snippet}
	</PlateHead>

	{#if tab === 'orders'}
		<div class="border-line flex flex-wrap gap-1.5 border-b px-4 py-2.5">
			{#each ['ALL', 'DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as key (key)}
				<button
					type="button"
					class="chip h-7 px-2.5 text-xs"
					aria-pressed={statusFilter === key}
					onclick={() => (statusFilter = key)}
				>
					{key === 'ALL' ? 'All' : humanizeEnum(key)}
				</button>
			{/each}
		</div>

		{#if orders.isPending}
			<Skeleton rows={6} />
		{:else if poRows.length === 0}
			<Empty
				icon={Truck}
				title={statusFilter === 'ALL'
					? 'No purchase orders yet'
					: `Nothing is ${humanizeEnum(statusFilter).toLowerCase()}`}
				body="Raise an order against a supplier, send it, and book the goods into stock when they land."
			>
				{#snippet action()}
					<Button size="sm" onclick={openPo} disabled={supplierRows.length === 0}
						>Raise an order</Button
					>
				{/snippet}
			</Empty>
		{:else}
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>Order</th>
							<th>Supplier</th>
							<th>State</th>
							<th class="hidden sm:table-cell">Raised</th>
							<th class="tbl-num">Total</th>
							<th style="width:130px"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each poRows as order (order.id)}
							<tr class="group">
								<td class="u-mono text-ink text-sm font-[620]">{order.number}</td>
								<td class="text-ink-2 min-w-0 truncate text-sm">
									{supplierName(order.supplierId)}
								</td>
								<td>
									<Stamp tone={PO_TONE[order.status] ?? 'neutral'}
										>{humanizeEnum(order.status)}</Stamp
									>
								</td>
								<td class="text-ink-3 hidden text-xs sm:table-cell">
									{formatRelative(order.createdAt)}
								</td>
								<td class="tbl-num u-num text-ink text-sm font-[600]">
									{formatMoney(order.total)}
								</td>
								<td>
									<div class="flex items-center justify-end gap-1">
										{#if order.status === 'DRAFT'}
											<Button
												size="sm"
												variant="outline"
												onclick={() => setStatus(order.id, 'ORDERED')}
											>
												Send
											</Button>
										{:else if ['ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status)}
											<Button size="sm" onclick={() => openReceive(order.id)}>
												<PackageCheck size={14} />
												Receive
											</Button>
										{/if}
										{#if ['DRAFT', 'ORDERED'].includes(order.status)}
											<Button
												size="icon"
												variant="ghost"
												class="btn-sm"
												aria-label="Cancel {order.number}"
												onclick={() => setStatus(order.id, 'CANCELLED')}
											>
												<Trash2 size={14} />
											</Button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else if suppliers.isPending}
		<Skeleton rows={6} />
	{:else if supplierRows.length === 0}
		<Empty
			icon={Truck}
			title="No suppliers yet"
			body="Add the people you buy from, and every order, payment and balance lands against their name."
		>
			{#snippet action()}
				<Button size="sm" onclick={openSupplier}>Add a supplier</Button>
			{/snippet}
		</Empty>
	{:else}
		<ul class="divide-line divide-y">
			{#each supplierRows as supplier (supplier.id)}
				<li>
					<button
						type="button"
						class="group hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
						onclick={() => (ledgerFor = { id: supplier.id, name: supplier.name })}
					>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-2">
								<span class="text-ink truncate text-sm font-[560]">{supplier.name}</span>
								{#if !supplier.isActive}
									<Stamp tone="neutral" dot={false}>Inactive</Stamp>
								{/if}
							</span>
							<span class="text-ink-3 mt-0.5 block truncate text-xs">
								{supplier.contactName || supplier.phone || 'No contact on file'}
								{#if supplier.paymentTerms}
									· {supplier.paymentTerms} day terms
								{/if}
							</span>
						</span>
						<span
							class="text-brass-ink shrink-0 text-xs font-[600] opacity-0 transition-opacity group-hover:opacity-100"
						>
							Ledger →
						</span>
						<ChevronRight size={15} class="text-ink-3 shrink-0" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Plate>

<!-- ── supplier ledger ──────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={ledgerFor !== null}
	onOpenChange={(value) => {
		if (!value) ledgerFor = null;
	}}
	title={ledgerFor?.name ?? 'Supplier'}
	sub="Every purchase, payment and adjustment against them"
	width={640}
>
	{#if ledger.isPending}
		<Skeleton rows={5} />
	{:else}
		<div
			class="border-line bg-surface-2 mb-4 flex items-end justify-between rounded-sm border px-4 py-3"
		>
			<div>
				<p class="u-label">Balance owed</p>
				<p class="u-figure text-ink mt-1 text-[26px]">
					{formatMoney(ledger.data?.balance ?? '0')}
				</p>
			</div>
			<Button size="sm" onclick={openPay}>
				<Banknote size={14} />
				Record a payment
			</Button>
		</div>

		{#if (ledger.data?.entries ?? []).length === 0}
			<Empty
				icon={ScrollText}
				title="Nothing on the ledger"
				body="New purchase order against this supplier and the entries start here."
			/>
		{:else}
			<ul class="divide-line divide-y">
				{#each ledger.data?.entries ?? [] as entry (entry.id)}
					{@const credit = Number(entry.credit) > 0}
					<li class="flex items-center gap-3 py-2.5">
						<span
							class="grid size-7 shrink-0 place-items-center rounded-sm
									{credit ? 'bg-herb-wash text-herb' : 'bg-surface-3 text-ink-2'}"
						>
							{#if credit}<Minus size={13} />{:else}<Plus size={13} />{/if}
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-ink text-sm font-[540]">
								{humanizeEnum(entry.entryType)}
								{#if entry.reference}
									<span class="u-mono text-ink-3 text-xs">· {entry.reference}</span>
								{/if}
							</p>
							<p class="text-ink-3 text-xs">{formatRelative(entry.createdAt)}</p>
						</div>
						<div class="shrink-0 text-right">
							<p class="u-num text-sm font-[600] {credit ? 'text-herb' : 'text-ink'}">
								{credit ? '−' : '+'}{formatMoney(credit ? entry.credit : entry.debit)}
							</p>
							<p class="u-num text-ink-3 text-xs">
								balance {formatMoney(entry.balanceAfter)}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (ledgerFor = null)}>Close</Button>
	{/snippet}
</Modal>

<!-- ── record a payment ─────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={payOpen}
	onOpenChange={(value) => {
		if (!value) payOpen = false;
	}}
	title="Record a payment"
	sub={ledgerFor?.name}
	width={440}
>
	<div class="form-stack">
		<Field label="Amount" for="pay-amt" required>
			<div class="field-shell">
				<Input
					id="pay-amt"
					class=" u-num"
					bind:value={payAmount}
					placeholder="0.00"
					inputmode="decimal"
				/>
				<span class="text-ink-3 pr-3 text-[12px]">PKR</span>
			</div>
		</Field>
		<Field label="Method" for="pay-method">
			<div class="flex flex-wrap gap-1.5">
				{#each ['CASH', 'BANK_TRANSFER', 'CARD'] as option (option)}
					<button
						type="button"
						class="chip h-7 px-2.5 text-xs"
						aria-pressed={payMethod === option}
						onclick={() => (payMethod = option)}
					>
						{humanizeEnum(option)}
					</button>
				{/each}
			</div>
		</Field>
		<Field
			label="Reference"
			hint="Cheque number, transfer ID — whatever identifies it."
			for="pay-ref"
		>
			<Input id="pay-ref" class="" bind:value={payReference} />
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (payOpen = false)}>Cancel</Button>
		<Button loading={paying} disabled={!payAmount} onclick={pay}>Record payment</Button>
	{/snippet}
</Modal>

<!-- ── new supplier ─────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={supplierOpen}
	onOpenChange={(value) => {
		if (!value) supplierOpen = false;
	}}
	title="Add a supplier"
	sub="Terms and contact details"
	width={560}
>
	<FormSection title="Supplier details" description="Business name and primary contact.">
		<Field label="Name" for="s-name" required class="sm:col-span-2">
			<Input id="s-name" class="" bind:value={supplierForm.name} placeholder="Metro Cash & Carry" />
		</Field>
		<Field label="Contact person" for="s-contact">
			<Input id="s-contact" class="" bind:value={supplierForm.contactName} placeholder="Imran" />
		</Field>
		<Field label="Phone" for="s-phone">
			<Input
				type="tel"
				autocomplete="tel"
				id="s-phone"
				class=""
				bind:value={supplierForm.phone}
				placeholder="+92 300 0000000"
			/>
		</Field>
		<Field label="Email" for="s-email" class="sm:col-span-2">
			<Input
				autocomplete="email"
				id="s-email"
				type="email"
				class=""
				bind:value={supplierForm.email}
			/>
		</Field>
		<Field label="Address" for="s-address" class="sm:col-span-2">
			<Textarea id="s-address" class=" min-h-[60px] resize-y" bind:value={supplierForm.address}
			></Textarea>
		</Field>
	</FormSection>
	<FormSection title="Payment agreement" description="When this supplier expects payment.">
		<Field
			label="Payment terms"
			hint="Days before an invoice is due."
			for="s-terms"
			class="sm:col-span-2"
		>
			<div class="field-shell">
				<Input
					id="s-terms"
					type="number"
					min="0"
					max="365"
					class=" u-num"
					bind:value={supplierForm.paymentTermsDays}
				/>
				<span class="text-ink-3 pr-3 text-[12px]">days</span>
			</div>
		</Field>
	</FormSection>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (supplierOpen = false)}>Cancel</Button>
		<Button loading={savingSupplier} disabled={!supplierForm.name.trim()} onclick={addSupplier}>
			Add supplier
		</Button>
	{/snippet}
</Modal>

<!-- ── raise a purchase order ───────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={poOpen}
	onOpenChange={(value) => {
		if (!value) poOpen = false;
	}}
	title="New purchase order"
	sub="Create a draft order, then send it to the supplier."
	width={680}
>
	<FormSection title="Order details" description="Choose a supplier and expected delivery date.">
		<Field label="Supplier" for="po-sup">
			<SelectField
				id="po-sup"
				class=""
				bind:value={poSupplier}
				items={[
					...supplierRows
						.map((supplier) => [{ value: supplier.id, label: `${supplier.name}` }])
						.flat()
				]}
			/>
		</Field>
		<Field
			label="Expected delivery date"
			hint="Optional — when you expect it to land."
			for="po-exp"
		>
			<Input id="po-exp" type="date" class="" bind:value={poExpected} />
		</Field>
	</FormSection>

	<div class="perf-rule mt-4"></div>

	<div class="mt-3">
		<label class="lbl" for="po-find">Lines</label>
		<div class="field-shell">
			<Search />
			<Input
				aria-label="Search"
				id="po-find"
				class=""
				bind:value={poQuery}
				placeholder="Search products to order…"
			/>
		</div>
		{#if poQuery.trim()}
			<ul class="border-line mt-2 max-h-[150px] overflow-y-auto rounded-sm border">
				{#each poCandidates as product (product.id)}
					<li>
						<button
							type="button"
							class="hover:bg-surface-2 flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
							onclick={() => addPoLine(product)}
						>
							<span class="text-ink min-w-0 truncate text-sm">{product.name}</span>
							<span class="u-num text-ink-3 shrink-0 text-xs">
								cost {formatMoney(product.costPrice ?? '0')}
							</span>
						</button>
					</li>
				{:else}
					<li class="text-ink-3 px-3 py-3 text-center text-[12px]">Nothing matches that.</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if poLines.length}
		<ul class="mt-3 space-y-1.5">
			{#each poLines as line, i (line.productId)}
				<li class="flex items-center gap-2.5">
					<span class="text-ink min-w-0 flex-1 truncate text-sm">{line.name}</span>
					<div class="flex items-center gap-1">
						<button
							type="button"
							class="btn btn-ghost btn-icon btn-sm"
							aria-label="One fewer {line.name}"
							onclick={() => (poLines[i].quantity = Math.max(1, line.quantity - 1))}
						>
							<Minus size={13} />
						</button>
						<Input
							aria-label="Quantity for {line.name}"
							type="number"
							min="1"
							class=" u-num h-7 w-[60px] px-2 text-center text-sm"
							bind:value={line.quantity}
						/>
						<button
							type="button"
							class="btn btn-ghost btn-icon btn-sm"
							aria-label="One more {line.name}"
							onclick={() => (poLines[i].quantity = line.quantity + 1)}
						>
							<Plus size={13} />
						</button>
					</div>
					<div class="field-shell w-[110px]">
						<Input
							aria-label="Unit cost for {line.name}"
							class=" u-num h-7 px-2 text-right text-sm"
							bind:value={line.unitCost}
							inputmode="decimal"
						/>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-icon btn-sm text-ink-3 hover:text-brick"
						aria-label="Remove {line.name}"
						onclick={() => (poLines = poLines.filter((l) => l.productId !== line.productId))}
					>
						<Trash2 size={14} />
					</button>
				</li>
			{/each}
		</ul>

		<div class="border-line mt-3 flex items-baseline justify-between border-t pt-3">
			<span class="u-label">Order total</span>
			<span class="u-figure text-ink text-[20px]">{formatMoney(String(poTotal / 100))}</span>
		</div>
	{/if}

	<Field label="Notes" for="po-notes" class="mt-3">
		<Input
			id="po-notes"
			class=""
			bind:value={poNotes}
			placeholder="Deliver to the back gate before 10am"
		/>
	</Field>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (poOpen = false)}>Cancel</Button>
		<Button loading={savingPo} disabled={!poSupplier || poLines.length === 0} onclick={createPo}>
			Raise draft
		</Button>
	{/snippet}
</Modal>

<!-- ── receive goods ────────────────────────────────────────────────────── -->
<Modal
	presentation="sheet"
	open={receiveFor !== null}
	onOpenChange={(value) => {
		if (!value) receiveFor = null;
	}}
	title="Book in goods"
	sub={receiving.data
		? `${receiving.data.number} · ${supplierName(receiving.data.supplierId)}`
		: 'Loading…'}
	width={620}
>
	{#if receiving.isPending}
		<Skeleton rows={4} />
	{:else if receiving.data}
		<p class="text-ink-3 mb-3 text-[12px]">
			Enter what actually arrived. Anything you leave blank stays on order.
		</p>
		<ul class="space-y-2">
			{#each receiving.data.items as item (item.id)}
				{@const outstanding = item.quantity - item.receivedQuantity}
				<li class="border-line flex items-center gap-3 rounded-sm border px-3 py-2.5">
					<div class="min-w-0 flex-1">
						<p class="text-ink truncate text-sm font-[540]">
							{productName(item.productId)}
						</p>
						<p class="text-ink-3 text-xs">
							Ordered <span class="u-num">{item.quantity}</span>
							{#if item.receivedQuantity}
								· already in <span class="u-num">{item.receivedQuantity}</span>
							{/if}
							· <span class="u-num">{outstanding}</span> outstanding
						</p>
					</div>
					<div class="field-shell w-[92px] shrink-0">
						<Input
							aria-label="Received quantity"
							type="number"
							min="0"
							max={outstanding}
							placeholder="0"
							class=" u-num h-8 text-center text-sm"
							value={received[item.id] ?? ''}
							oninput={(event) => {
								const value = Math.max(
									0,
									Math.min(outstanding, Number(event.currentTarget.value) || 0)
								);
								received = { ...received, [item.id]: value };
							}}
						/>
					</div>
					<button
						type="button"
						class="chip h-7 shrink-0 px-2.5 text-xs"
						onclick={() => (received = { ...received, [item.id]: outstanding })}
					>
						All
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (receiveFor = null)}>Cancel</Button>
		<Button loading={receivingBusy} onclick={confirmReceive}>
			<PackageCheck size={14} />
			Book into stock
		</Button>
	{/snippet}
</Modal>
