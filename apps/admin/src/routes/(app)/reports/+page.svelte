<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '#lib/api';
	import { authenticated } from '#lib/session';
	import {
		formatMoney,
		formatMoneyCompact,
		formatNumber,
		formatPercent,
		shiftDay,
		todayISO
	} from '#lib/format';
	import { orderLabel, orderTone, PAYMENT_METHOD_LABEL } from '#lib/status';
	import PageHead from '#lib/ui/page-head.svelte';
	import Plate from '#lib/ui/plate.svelte';
	import PlateHead from '#lib/ui/plate-head.svelte';
	import Stamp from '#lib/ui/stamp.svelte';
	import Empty from '#lib/ui/empty.svelte';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Figure from '#lib/ui/figure.svelte';
	import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
	import Search from '@lucide/svelte/icons/search';
	import Box from '@lucide/svelte/icons/box';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import Users from '@lucide/svelte/icons/users';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Landmark from '@lucide/svelte/icons/landmark';

	const today = todayISO();
	let from = $state(shiftDay(today, -29));
	let to = $state(today);

	type Tab = 'sales' | 'money' | 'stock' | 'kitchen';
	let tab = $state<Tab>('sales');

	const RANGES = [
		{ label: 'Today', days: 0 },
		{ label: '7 days', days: 6 },
		{ label: '30 days', days: 29 },
		{ label: '90 days', days: 89 }
	];

	const setRange = (days: number) => {
		from = shiftDay(today, -days);
		to = today;
	};

	const range = $derived({ from, to });

	const summary = createQuery(() => ({
		queryKey: ['reports', 'summary', range],
		queryFn: () => api.salesSummary(range),
		enabled: $authenticated
	}));

	const topProducts = createQuery(() => ({
		queryKey: ['reports', 'top-products', range],
		queryFn: () => api.topProducts(range),
		enabled: $authenticated
	}));

	const methods = createQuery(() => ({
		queryKey: ['reports', 'methods', range],
		queryFn: () => api.paymentMethods(range),
		enabled: $authenticated
	}));

	const valuation = createQuery(() => ({
		queryKey: ['reports', 'valuation'],
		queryFn: () => api.inventoryValuation(),
		enabled: $authenticated
	}));

	const purchases = createQuery(() => ({
		queryKey: ['reports', 'purchases', range],
		queryFn: () => api.purchaseReport(range),
		enabled: $authenticated
	}));

	const taxes = createQuery(() => ({
		queryKey: ['reports', 'taxes', range],
		queryFn: () => api.taxesReport(range),
		enabled: $authenticated
	}));

	const customers = createQuery(() => ({
		queryKey: ['reports', 'customers'],
		queryFn: () => api.customersReport(),
		enabled: $authenticated
	}));

	/** The report only ever returns the top twenty, so this filters within that
	 *  window — a miss here means "not in the top twenty", not "no such customer". */
	let customerQuery = $state('');
	const visibleCustomers = $derived(
		(customers.data ?? []).filter((row) => {
			const needle = customerQuery.trim().toLowerCase();
			return needle === '' || row.name.toLowerCase().includes(needle);
		})
	);

	const kitchen = createQuery(() => ({
		queryKey: ['reports', 'kitchen', range],
		queryFn: () => api.kitchenReport(range),
		enabled: $authenticated
	}));

	// ── derived figures ───────────────────────────────────────────────────
	const gross = $derived(Number(summary.data?.grossSales ?? 0));
	const net = $derived(Number(summary.data?.netSales ?? 0));
	const discounts = $derived(Number(summary.data?.discounts ?? 0));

	const methodTotal = $derived(
		(methods.data ?? []).reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0)
	);

	const topRevenue = $derived((topProducts.data ?? [])[0]?.revenue ?? '0');
	const topQty = $derived((topProducts.data ?? [])[0]?.quantitySold ?? 0);

	const highestValue = $derived((valuation.data?.items ?? [])[0]?.value ?? '0');

	const taxCollected = $derived(Number(taxes.data?.collected?.taxCollected ?? 0));
	const netExTax = $derived(net - taxCollected);

	const METHOD_TONE: Record<string, 'herb' | 'slate' | 'brass' | 'amber' | 'brick'> = {
		CASH: 'herb',
		CARD: 'slate',
		BANK_TRANSFER: 'brass',
		JAZZCASH: 'amber',
		EASYPAISA: 'amber'
	};
</script>

<svelte:head><title>Reports — ROMS</title></svelte:head>

<PageHead title="Reports" sub="Sales and operating performance for your selected period.">
	{#snippet actions()}
		<div class="border-line flex rounded-sm border p-0.5">
			{#each RANGES as option (option.label)}
				<button
					type="button"
					class="chip h-7 rounded-xs px-2.5 text-xs"
					aria-pressed={from === shiftDay(today, -option.days)}
					onclick={() => setRange(option.days)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<div class="flex items-center gap-1.5">
			<Input type="date" class=" h-8 w-[132px] text-[12px]" bind:value={from} />
			<span class="text-ink-3">→</span>
			<Input type="date" class=" h-8 w-[132px] text-[12px]" bind:value={to} />
		</div>
	{/snippet}
</PageHead>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<Figure
		label="Net sales"
		value={summary.isPending ? '—' : formatMoney(summary.data?.netSales ?? '0')}
		sub={`${formatNumber(summary.data?.orderCount ?? 0)} orders`}
	/>
	<Figure
		label="Average ticket"
		value={summary.isPending ? '—' : formatMoney(summary.data?.averageOrderValue ?? '0')}
		sub="Net of discounts, tax included"
	/>
	<Figure
		label="Tax collected"
		value={taxes.isPending ? '—' : formatMoney(taxes.data?.collected?.taxCollected ?? '0')}
		sub="A liability, not income"
	/>
	<Figure
		label="Discounts given"
		value={summary.isPending ? '—' : formatMoney(summary.data?.discounts ?? '0')}
		delta={gross > 0 ? formatPercent(discounts / gross, 1) : undefined}
		deltaTone="brick"
		sub="Share of gross"
	/>
</div>

<div class="mt-4 flex flex-wrap gap-1.5">
	{#each [{ id: 'sales', label: 'Sales', icon: ChartNoAxesColumn }, { id: 'money', label: 'Money', icon: Landmark }, { id: 'stock', label: 'Stock & supply', icon: Box }, { id: 'kitchen', label: 'Kitchen', icon: CookingPot }] as option (option.id)}
		<button
			type="button"
			class="chip h-7 gap-1.5 px-3 text-xs"
			aria-pressed={tab === option.id}
			onclick={() => (tab = option.id as Tab)}
		>
			<option.icon size={13} />
			{option.label}
		</button>
	{/each}
</div>

<!-- ── sales ────────────────────────────────────────────────────────────── -->
{#if tab === 'sales'}
	<div class="mt-2.5 grid grid-cols-1 gap-3 lg:grid-cols-5">
		<Plate class="overflow-hidden lg:col-span-3">
			<PlateHead title="Top sellers" sub="By quantity moved, top 20">
				{#snippet actions()}
					{#if topProducts.data?.[0]}
						<span class="u-num text-ink-3 text-xs">
							{formatNumber(topQty)} sold · {formatMoney(topRevenue)}
						</span>
					{/if}
				{/snippet}
			</PlateHead>

			{#if topProducts.isPending}
				<Skeleton rows={7} />
			{:else if (topProducts.data?.length ?? 0) === 0}
				<Empty
					icon={ChartNoAxesColumn}
					title="Nothing sold in this window"
					body="Widen the dates or check another branch."
				/>
			{:else}
				{@const max = Math.max(...(topProducts.data ?? []).map((row) => row.quantitySold), 1)}
				<ul class="divide-line divide-y">
					{#each topProducts.data ?? [] as row, i (row.productId ?? row.name)}
						<li class="flex items-center gap-3 px-4 py-2">
							<span class="u-num text-ink-3 w-5 shrink-0 text-xs">{i + 1}</span>
							<div class="min-w-0 flex-1">
								<p class="text-ink truncate text-sm font-[540]">{row.name}</p>
								<!-- the bar is the share of the leader, not of the total: it ranks -->
								<div class="bg-surface-3 mt-1 h-1 overflow-hidden rounded-full">
									<div
										class="bg-brass h-full rounded-full"
										style="width: {(row.quantitySold / max) * 100}%"
									></div>
								</div>
							</div>
							<span class="u-num text-ink-2 w-10 shrink-0 text-right text-[12px] font-[600]">
								{formatNumber(row.quantitySold)}
							</span>
							<span
								class="u-num text-ink hidden w-[86px] shrink-0 text-right text-[12px] sm:block"
								title={formatMoney(row.revenue)}
							>
								{formatMoneyCompact(row.revenue)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Plate>

		<Plate class="overflow-hidden lg:col-span-2">
			<PlateHead title="Best customers" sub="By revenue, top 20">
				{#snippet actions()}
					<div class="field-shell h-8 min-w-[170px]">
						<Search />
						<Input class=" text-sm" bind:value={customerQuery} placeholder="Find a name…" />
					</div>
				{/snippet}
			</PlateHead>
			{#if customers.isPending}
				<Skeleton rows={6} />
			{:else if (customers.data?.length ?? 0) === 0}
				<Empty
					icon={Users}
					title="No customer revenue yet"
					body="Attach a profile to a ticket and the visits start counting."
				/>
			{:else if visibleCustomers.length === 0}
				<Empty
					icon={Search}
					title="No name matches"
					body={`None of the top ${customers.data?.length ?? 0} customers by revenue is called that.`}
				/>
			{:else}
				<ul class="divide-line divide-y">
					{#each visibleCustomers as row, i (row.customerId)}
						<li class="flex items-center gap-3 px-4 py-2.5">
							<span class="u-num text-ink-3 w-5 shrink-0 text-xs">{i + 1}</span>
							<div class="min-w-0 flex-1">
								<p class="text-ink truncate text-sm font-[540]">{row.name}</p>
								<p class="u-num text-ink-3 text-xs">{formatNumber(row.orders)} orders</p>
							</div>
							<span class="u-num text-ink shrink-0 text-sm font-[600]">
								{formatMoney(row.revenue)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Plate>
	</div>

	<!-- ── money ────────────────────────────────────────────────────────────── -->
{:else if tab === 'money'}
	<div class="mt-2.5 grid grid-cols-1 gap-3 lg:grid-cols-2">
		<Plate class="overflow-hidden">
			<PlateHead title="How they paid" sub="Captured payments by method">
				{#snippet actions()}
					<span class="u-num text-ink-3 text-xs">{formatMoney(String(methodTotal / 100))}</span>
				{/snippet}
			</PlateHead>
			{#if methods.isPending}
				<Skeleton rows={5} />
			{:else if (methods.data?.length ?? 0) === 0}
				<Empty
					icon={Landmark}
					title="No payments captured"
					body="Nothing has been charged in this window."
				/>
			{:else}
				{@const peak = Math.max(...(methods.data ?? []).map((row) => Number(row.amount)), 1)}
				<ul class="p-4 pt-2">
					{#each methods.data ?? [] as row (row.method)}
						<li class="py-2.5">
							<div class="flex items-center justify-between gap-3">
								<div class="flex items-center gap-2">
									<Stamp tone={METHOD_TONE[row.method] ?? 'neutral'}>
										{PAYMENT_METHOD_LABEL[row.method] ?? row.method}
									</Stamp>
									<span class="u-num text-ink-3 text-xs">{formatNumber(row.count)}×</span>
								</div>
								<span class="u-num text-ink text-sm font-[600]">{formatMoney(row.amount)}</span>
							</div>
							<div class="bg-surface-3 mt-1.5 h-1.5 overflow-hidden rounded-full">
								<div
									class="bg-brass h-full rounded-full"
									style="width: {(Number(row.amount) / peak) * 100}%"
								></div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Plate>

		<div class="grid gap-3">
			<Plate class="overflow-hidden">
				<PlateHead title="Tax" sub="What was collected and what it was on" />
				{#if taxes.isPending}
					<Skeleton rows={3} />
				{:else}
					<div class="p-4 pt-2">
						<div class="border-line flex items-baseline justify-between border-b py-2.5">
							<span class="text-ink-2 text-sm">Taxable orders</span>
							<span class="u-num text-ink text-sm font-[600]">
								{formatNumber(taxes.data?.collected?.taxableOrders ?? 0)}
							</span>
						</div>
						<div class="border-line flex items-baseline justify-between border-b py-2.5">
							<span class="text-ink-2 text-sm">Tax collected</span>
							<span class="u-num text-ink text-sm font-[600]">
								{formatMoney(taxes.data?.collected?.taxCollected ?? '0')}
							</span>
						</div>
						<div class="flex items-baseline justify-between py-2.5">
							<span class="text-ink-2 text-sm">Sales before tax</span>
							<span class="u-num text-ink text-sm font-[600]"
								>{formatMoney(String(netExTax / 100))}</span
							>
						</div>

						{#if (taxes.data?.invoices?.length ?? 0) > 0}
							<div class="perf-rule my-3"></div>
							<p class="u-label mb-2">Filed invoices</p>
							<ul class="space-y-1.5">
								{#each taxes.data?.invoices ?? [] as row (row.status)}
									<li class="flex items-center justify-between gap-3">
										<Stamp
											tone={row.status === 'SUBMITTED'
												? 'herb'
												: row.status === 'FAILED'
													? 'brick'
													: 'neutral'}
										>
											{row.status}
										</Stamp>
										<span class="u-num text-ink-2 text-[12px]">
											{formatNumber(row.count)} · {formatMoney(row.tax)}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</Plate>

			<Plate class="overflow-hidden">
				<PlateHead title="Purchasing" sub="What was bought, by supplier" />
				{#if purchases.isPending}
					<Skeleton rows={3} />
				{:else if (purchases.data?.bySupplier.length ?? 0) === 0}
					<Empty
						icon={ReceiptText}
						title="Nothing purchased"
						body="Raise a purchase order and it shows here."
					/>
				{:else}
					<ul class="divide-line divide-y">
						{#each purchases.data?.bySupplier.slice(0, 6) ?? [] as row (row.supplierId)}
							<li class="flex items-center justify-between gap-3 px-4 py-2.5">
								<div class="min-w-0">
									<p class="text-ink truncate text-sm font-[540]">{row.supplierName}</p>
									<p class="u-num text-ink-3 text-xs">{formatNumber(row.orders)} orders</p>
								</div>
								<span class="u-num text-ink shrink-0 text-sm font-[600]">
									{formatMoney(row.total)}
								</span>
							</li>
						{/each}
					</ul>
					{#if (purchases.data?.byStatus.length ?? 0) > 0}
						<div class="border-line flex flex-wrap gap-1.5 border-t px-4 py-2.5">
							{#each purchases.data?.byStatus ?? [] as row (row.status)}
								<span class="chip h-6 cursor-default px-2 text-xs">
									{orderLabel(row.status)}
									<span class="chip-count u-num">{row.count}</span>
								</span>
							{/each}
						</div>
					{/if}
				{/if}
			</Plate>
		</div>
	</div>

	<!-- ── stock & supply ───────────────────────────────────────────────────── -->
{:else if tab === 'stock'}
	<Plate class="mt-2.5 overflow-hidden">
		<PlateHead title="Inventory valuation" sub="Stock on hand at cost">
			{#snippet actions()}
				{#if valuation.data}
					<div class="flex items-baseline gap-2">
						<span class="u-label">Total</span>
						<span class="u-figure text-ink text-[18px]">{formatMoney(valuation.data.total)}</span>
					</div>
				{/if}
			{/snippet}
		</PlateHead>

		{#if valuation.isPending}
			<Skeleton rows={7} />
		{:else if (valuation.data?.items.length ?? 0) === 0}
			<Empty
				icon={Box}
				title="Nothing in stock"
				body="Receive a purchase order and the shelves show up here, valued at cost."
			/>
		{:else}
			<p class="border-line text-ink-3 border-b px-4 py-2 text-xs">
				Showing the 200 most valuable lines
				{#if highestValue !== '0'}
					· the top line alone is worth {formatMoney(highestValue)}
				{/if}
			</p>
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>Product</th>
							<th class="tbl-num">On hand</th>
							<th class="tbl-num">Unit cost</th>
							<th class="tbl-num">Value</th>
						</tr>
					</thead>
					<tbody>
						{#each valuation.data?.items ?? [] as row (row.productId)}
							<tr>
								<td class="text-ink text-sm font-[540]">{row.name}</td>
								<td class="tbl-num u-num text-ink-2 text-sm">{formatNumber(row.quantity)}</td>
								<td class="tbl-num u-num text-ink-3 text-sm">
									{row.cost === null ? 'No cost set' : formatMoney(row.cost)}
								</td>
								<td class="tbl-num u-num text-ink text-sm font-[600]">
									{formatMoney(row.value)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Plate>

	<!-- ── kitchen ──────────────────────────────────────────────────────────── -->
{:else}
	<div class="mt-2.5 grid grid-cols-1 gap-3 lg:grid-cols-3">
		<Plate class="overflow-hidden lg:col-span-2">
			<PlateHead title="Ticket pipeline" sub="Every ticket, by where it stands" />
			{#if kitchen.isPending}
				<Skeleton rows={5} />
			{:else if (kitchen.data?.byStatus.length ?? 0) === 0}
				<Empty
					icon={CookingPot}
					title="The pass is empty"
					body="No tickets have been raised yet."
				/>
			{:else}
				{@const peak = Math.max(...(kitchen.data?.byStatus ?? []).map((row) => row.count), 1)}
				<ul class="p-4 pt-2">
					{#each kitchen.data?.byStatus ?? [] as row (row.status)}
						<li class="py-2.5">
							<div class="flex items-center justify-between gap-3">
								<Stamp tone={orderTone(row.status)}>{orderLabel(row.status)}</Stamp>
								<span class="u-num text-ink text-sm font-[600]">{formatNumber(row.count)}</span>
							</div>
							<div class="bg-surface-3 mt-1.5 h-1.5 overflow-hidden rounded-full">
								<div
									class="bg-brass h-full rounded-full"
									style="width: {(row.count / peak) * 100}%"
								></div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Plate>

		<Plate class="overflow-hidden">
			<PlateHead title="Time at the pass" sub="Average minutes from fire to ready" />
			{#if kitchen.isPending}
				<Skeleton rows={2} />
			{:else if kitchen.data?.timing}
				<div class="p-4 pt-3">
					<p class="u-figure text-ink text-[40px]">
						{Number(kitchen.data.timing.avgMinutes).toFixed(1)}
					</p>
					<p class="text-ink-3 mt-1 text-xs">
						minutes, averaged over tickets that reached the pass
					</p>
				</div>
			{:else}
				<Empty
					icon={CookingPot}
					title="Not enough data"
					body="Timings appear once tickets have been prepared and marked ready."
				/>
			{/if}
		</Plate>
	</div>
{/if}
